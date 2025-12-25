const KEY = "labels_items_v2";
const loadItems = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const saveItems = (items) => localStorage.setItem(KEY, JSON.stringify(items));

const video = document.getElementById("video");
const imeiEl = document.getElementById("imei");
const codeEl = document.getElementById("code");
const listEl = document.getElementById("list");

function makeSerial(code){
  if(!/^\d{2,3}$/.test(code)) throw new Error("الكود لازم يكون 2 أو 3 أرقام");
  const rest = 5 - code.length;
  let rand = "";
  for(let i=0;i<rest;i++) rand += Math.floor(Math.random()*10);
  return "13" + code + rand;
}

function normalizeImei(raw){
  const digits = (raw || "").replace(/\D/g,"");
  if(digits.length === 15) return digits;
  if(digits.length > 15) return digits.slice(-15);
  return digits;
}

function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = 0.04;
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 120);
  }catch(_){}
}

function notifyCaptured(){
  if(navigator.vibrate) navigator.vibrate(80);
  beep();
}

function render(){
  const items = loadItems();
  if(!items.length){
    listEl.innerHTML = "ما في أجهزة بعد.";
    return;
  }
  listEl.innerHTML = items.map((it,i)=>`
    <div class="item">
      ${i+1}) Serial: <b>${it.serial}</b>
      <div style="margin-top:6px;display:flex;gap:8px">
        <button onclick="removeItem(${i})" style="padding:6px;font-size:14px">حذف</button>
      </div>
    </div>
  `).join("");
}

window.removeItem = function(i){
  const items = loadItems();
  items.splice(i,1);
  saveItems(items);
  render();
};

let _zxingReader = null;

async function stopCamera(){
  try{
    if(_zxingReader){
      _zxingReader.reset();
      _zxingReader = null;
    }
    const stream = video.srcObject;
    if(stream){
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  }catch(_){}
}

document.getElementById("stopCam").onclick = stopCamera;

document.getElementById("startCam").onclick = async () => {
  await stopCamera();

  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;

    // Native BarcodeDetector
    if("BarcodeDetector" in window){
      const detector = new BarcodeDetector({ formats: ["code_128","ean_13","qr_code","itf","code_39"] });

      const tick = async () => {
        if(!video.srcObject) return;
        if(video.readyState === video.HAVE_ENOUGH_DATA){
          const codes = await detector.detect(video);
          if(codes && codes.length){
            const val = normalizeImei(codes[0].rawValue);
            if(/^\d{15}$/.test(val)){
              imeiEl.value = val;
              notifyCaptured();
              await stopCamera();
              return;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
      return;
    }

    // ZXing fallback (iPhone)
    if(!window.ZXing){
      alert("ZXing غير محمّل. أضف في index.html: <script src='https://unpkg.com/@zxing/library@latest'></script>");
      return;
    }

    _zxingReader = new ZXing.BrowserMultiFormatReader();
    _zxingReader.decodeFromVideoDevice(null, video, async (result, err) => {
      if(result){
        const val = normalizeImei(result.getText());
        if(/^\d{15}$/.test(val)){
          imeiEl.value = val;
          notifyCaptured();
          await stopCamera();
        }
      }
    });

  }catch(e){
    alert("فشل فتح الكاميرا: " + e.message);
  }
};

document.getElementById("add").onclick = () => {
  const imei = normalizeImei(imeiEl.value.trim());
  const code = codeEl.value.trim();

  if(!/^\d{15}$/.test(imei)) return alert("IMEI لازم يكون 15 رقم");
  if(!/^\d{2,3}$/.test(code)) return alert("الكود لازم يكون 2 أو 3 أرقام");

  // منع التكرار (اختياري)
  const items = loadItems();
  if(items.some(x => x.imei === imei)){
    return alert("هذا IMEI موجود مسبقًا في القائمة");
  }

  const serial = makeSerial(code);
  items.push({ imei, code, serial, at: Date.now() });
  saveItems(items);

  imeiEl.value = "";
  codeEl.value = "";
  render();
};

document.getElementById("clear").onclick = () => {
  saveItems([]);
  render();
};

document.getElementById("export").onclick = () => exportPdf(loadItems());

function exportPdf(items){
  if(!items.length) return alert("القائمة فاضية");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

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

    // Serial
    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.text(it.serial, x + labelW/2, y + 6, { align: "center" });

    // Barcode (IMEI)
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
