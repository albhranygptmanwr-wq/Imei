// ===== Storage =====
const KEY = "labels_items_v1";
const loadItems = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const saveItems = (items) => localStorage.setItem(KEY, JSON.stringify(items));

// ===== Helpers =====
function makeSerial(code){
  if(!/^\d{2,3}$/.test(code)) throw new Error("الكود لازم يكون 2 أو 3 أرقام");
  const rest = 5 - code.length;
  let rand = "";
  for(let i=0;i<rest;i++) rand += Math.floor(Math.random()*10);
  return "13" + code + rand; // بعد 13 = 5 خانات
}

function normalizeImei(raw){
  const digits = (raw || "").replace(/\D/g,"");
  if(digits.length === 15) return digits;
  if(digits.length > 15) return digits.slice(-15); // خذ آخر 15
  return digits;
}

function render(){
  const list = document.getElementById("list");
  const items = loadItems();
  if(!items.length){
    list.innerHTML = "ما في أجهزة بعد.";
    return;
  }
  list.innerHTML = items.map((it,i)=>(
    `<div class="item">${i+1}) Serial: <b>${it.serial}</b> — IMEI(barcode)</div>`
  )).join("");
}

// ===== UI =====
const video = document.getElementById("video");
const imeiEl = document.getElementById("imei");
const codeEl = document.getElementById("code");

document.getElementById("clear").onclick = () => {
  saveItems([]);
  render();
};

document.getElementById("add").onclick = () => {
  const imei = normalizeImei(imeiEl.value.trim());
  const code = codeEl.value.trim();

  if(!/^\d{15}$/.test(imei)) return alert("IMEI لازم يكون 15 رقم");
  if(!/^\d{2,3}$/.test(code)) return alert("الكود لازم يكون 2 أو 3 أرقام");

  const serial = makeSerial(code);
  const items = loadItems();
  items.push({ imei, code, serial, at: Date.now() });
  saveItems(items);

  imeiEl.value = "";
  codeEl.value = "";
  render();
};

document.getElementById("export").onclick = () => exportPdf(loadItems());

// ===== Camera Barcode Scan (BarcodeDetector) =====
document.getElementById("startCam").onclick = async () => {
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;

    if(!("BarcodeDetector" in window)){
      alert("BarcodeDetector غير مدعوم في جهازك. استخدم إدخال IMEI يدوي (أو نضيف ZXing fallback).");
      return;
    }

    const detector = new BarcodeDetector({
      formats: ["code_128","ean_13","qr_code","itf","code_39"]
    });

    const tick = async () => {
      if(video.readyState === video.HAVE_ENOUGH_DATA){
        const codes = await detector.detect(video);
        if(codes && codes.length){
          const val = normalizeImei(codes[0].rawValue);
          if(/^\d{15}$/.test(val)){
            imeiEl.value = val;
            stream.getTracks().forEach(t=>t.stop());
            return;
          }
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }catch(e){
    alert("فشل فتح الكاميرا: " + e.message);
  }
};

// ===== PDF Export (labels) =====
function exportPdf(items){
  if(!items.length) return alert("القائمة فاضية");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Label size (مثل اللي اشتغلنا عليه)
  const labelW = 45, labelH = 20;
  const gapX = 2, gapY = 2;
  const pageW = 210, pageH = 297;

  const cols = Math.floor((pageW + gapX) / (labelW + gapX));
  const rows = Math.floor((pageH + gapY) / (labelH + gapY));

  const totalW = cols * labelW + (cols - 1) * gapX;
  const totalH = rows * labelH + (rows - 1) * gapY;

  const startX = (pageW - totalW) / 2;
  const startY = (pageH - totalH) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 160;
  const ctx = canvas.getContext("2d");

  items.forEach((it, i) => {
    const pos = i % (cols * rows);
    if(pos === 0 && i !== 0) doc.addPage();

    const r = Math.floor(pos / cols);
    const c = pos % cols;

    const x = startX + c * (labelW + gapX);
    const y = startY + r * (labelH + gapY);

    // serial text
    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.text(it.serial, x + labelW/2, y + 6, { align: "center" });

    // barcode image (IMEI)
    ctx.clearRect(0,0,canvas.width,canvas.height);
    JsBarcode(canvas, it.imei, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 70
    });
    const img = canvas.toDataURL("image/png");
    doc.addImage(img, "PNG", x + 3, y + 8, labelW - 6, 10);
  });

  doc.save("labels.pdf");
}

render();
