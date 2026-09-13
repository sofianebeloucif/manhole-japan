"""Train a prefecture classifier from contributed personal photos.

Under models/min_samples labelled photos: only refresh models/meta.json with the
count and exit. Otherwise fine-tune mobilenet_v3_small and export ONNX.

Heavy deps (torch, torchvision, onnx) live in requirements-train.txt and are
imported lazily so the gate path runs with the base requirements only.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path.cwd()
MODELS = ROOT / "models"
META = MODELS / "meta.json"


def collect_samples(personal_dir: pathlib.Path, photos_dir: pathlib.Path):
    out = []
    for jf in sorted(personal_dir.glob("*.json")):
        if jf.name.startswith("_"):
            continue
        entries = json.loads(jf.read_text(encoding="utf-8"))
        for e in entries if isinstance(entries, list) else [entries]:
            p = e.get("properties", {})
            photo = p.get("photo")
            pref = p.get("prefecture_en")
            if not photo or not pref:
                continue
            path = ROOT / photo
            if path.exists() or (photos_dir / pathlib.Path(photo).name).exists():
                out.append((path, pref))
    return out


def _write_meta(n, classes=None, acc=None, trained=None, input_size=224, min_samples=50):
    META.write_text(json.dumps({
        "n_samples": n,
        "trained_at": trained,
        "classes": classes or [],
        "val_accuracy": acc,
        "input_size": input_size,
        "min_samples": min_samples,
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    MODELS.mkdir(exist_ok=True)
    min_samples = json.loads(META.read_text())["min_samples"] if META.exists() else 50
    samples = collect_samples(ROOT / "data" / "personal", ROOT / "assets" / "photos")
    n = len(samples)
    print(f"{n} labelled photo(s); need {min_samples}")

    if n < min_samples:
        _write_meta(n, min_samples=min_samples)
        print("below threshold - refreshed models/meta.json only")
        return

    import torch
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
    import torchvision.transforms as T
    from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
    from PIL import Image

    prefs = sorted({p for _, p in samples})
    # region fallback when too few classes are populated enough
    counts = {p: sum(1 for _, q in samples if q == p) for p in prefs}
    if sum(1 for p in prefs if counts[p] >= 3) < 4:
        raise SystemExit("not enough per-prefecture samples; add region-fallback labels first")
    idx = {p: i for i, p in enumerate(prefs)}

    tf = T.Compose([
        T.Resize((224, 224)),
        T.RandomHorizontalFlip(),
        T.ColorJitter(0.2, 0.2, 0.2),
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    class DS(Dataset):
        def __init__(self, rows):
            self.rows = rows

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, i):
            path, pref = self.rows[i]
            return tf(Image.open(path).convert("RGB")), idx[pref]

    torch.manual_seed(0)
    perm = torch.randperm(n).tolist()
    cut = max(1, int(n * 0.2))
    val_rows = [samples[i] for i in perm[:cut]]
    train_rows = [samples[i] for i in perm[cut:]]

    model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(prefs))
    opt = torch.optim.Adam(model.parameters(), lr=1e-4)
    lossf = nn.CrossEntropyLoss()
    tl = DataLoader(DS(train_rows), batch_size=16, shuffle=True)
    vl = DataLoader(DS(val_rows), batch_size=16)

    best_acc = 0.0
    for epoch in range(12):
        model.train()
        for x, y in tl:
            opt.zero_grad()
            lossf(model(x), y).backward()
            opt.step()
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for x, y in vl:
                correct += (model(x).argmax(1) == y).sum().item()
                total += len(y)
        acc = correct / max(1, total)
        print(f"epoch {epoch}: val_acc={acc:.3f}")
        best_acc = max(best_acc, acc)

    model.eval()
    dummy = torch.zeros(1, 3, 224, 224)
    onnx_path = MODELS / "prefecture-clf.onnx"
    torch.onnx.export(
        model, dummy, str(onnx_path), opset_version=17,
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}},
    )
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(str(onnx_path), str(MODELS / "prefecture-clf.int8.onnx"),
                         weight_type=QuantType.QInt8)
    except Exception as e:  # noqa: BLE001
        print(f"int8 quantise skipped: {e}")

    (MODELS / "labels.json").write_text(json.dumps(prefs, ensure_ascii=False), encoding="utf-8")
    _write_meta(n, classes=prefs, acc=round(best_acc, 3),
                trained=dt.datetime.now(dt.timezone.utc).isoformat(), min_samples=min_samples)
    print(f"exported {onnx_path.name}; val_acc={best_acc:.3f}")


if __name__ == "__main__":
    main()
