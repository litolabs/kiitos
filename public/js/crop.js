// A small square photo cropper. Drag to move, slide to zoom.
// Produces a 400 x 400 JPEG so storage stays tiny.

window.PhotoCropper = function PhotoCropper(container, zoomInput, image) {
  const OUTPUT = 400;
  const canvas = document.createElement("canvas");
  container.innerHTML = "";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let size = 0;
  let scale = 1; // pixels on screen per pixel of the photo
  let minScale = 1;
  let x = 0; // top-left corner of the photo on the canvas
  let y = 0;

  function fit() {
    size = container.clientWidth * (window.devicePixelRatio || 1);
    canvas.width = canvas.height = size;
    minScale = size / Math.min(image.width, image.height);
    scale = minScale * Number(zoomInput.value);
    x = (size - image.width * scale) / 2;
    y = (size - image.height * scale) / 2;
    draw();
  }

  function clamp() {
    const w = image.width * scale;
    const h = image.height * scale;
    x = Math.min(0, Math.max(size - w, x));
    y = Math.min(0, Math.max(size - h, y));
  }

  function draw() {
    clamp();
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
  }

  zoomInput.value = 1;
  zoomInput.oninput = () => {
    const centre = size / 2;
    const next = minScale * Number(zoomInput.value);
    x = centre - ((centre - x) * next) / scale;
    y = centre - ((centre - y) * next) / scale;
    scale = next;
    draw();
  };

  let drag = null;
  container.onpointerdown = (e) => {
    container.setPointerCapture(e.pointerId);
    drag = { px: e.clientX, py: e.clientY, x, y };
  };
  container.onpointermove = (e) => {
    if (!drag) return;
    const ratio = size / container.clientWidth;
    x = drag.x + (e.clientX - drag.px) * ratio;
    y = drag.y + (e.clientY - drag.py) * ratio;
    draw();
  };
  container.onpointerup = container.onpointercancel = () => { drag = null; };

  fit();

  return {
    toDataURL() {
      const out = document.createElement("canvas");
      out.width = out.height = OUTPUT;
      const ratio = OUTPUT / size;
      out.getContext("2d").drawImage(image, x * ratio, y * ratio, image.width * scale * ratio, image.height * scale * ratio);
      return out.toDataURL("image/jpeg", 0.85);
    },
  };
};
