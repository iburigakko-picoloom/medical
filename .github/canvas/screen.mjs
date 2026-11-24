// Runs in a clean Chromium document. Rebuild the visible DOM from permitted
// elements and computed styles; never copy app scripts, storage, URLs or handlers.
export function captureScreen({ id, name, purpose }) {
  const root = document.getElementById('root');

  const tags = new Set('main section article aside div header footer nav h1 h2 h3 h4 h5 h6 p span strong em b i small br hr ul ol li button label input textarea select option fieldset legend table thead tbody tr th td details summary img figure figcaption progress svg path circle ellipse rect line polyline polygon g title'.split(' '));
  const attributes = 'aria-label aria-hidden aria-current aria-pressed aria-expanded aria-checked placeholder disabled checked role alt viewBox fill stroke stroke-width stroke-linecap stroke-linejoin d cx cy r rx ry x y x1 x2 y1 y2 width height points transform opacity fill-rule clip-rule'.split(' ');
  const properties = 'display position top right bottom left z-index box-sizing width min-width max-width height min-height max-height margin padding gap flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self align-content justify-content justify-items justify-self grid-template-columns grid-template-rows grid-auto-flow grid-column grid-row overflow-x overflow-y background-color background-image color border-top border-right border-bottom border-left border-radius box-shadow font-family font-size font-weight line-height text-align text-decoration white-space letter-spacing opacity object-fit vertical-align list-style-type aspect-ratio'.split(' ');
  const rules = new Map();
  const common = new Map();
  const actions = [];

  function clone(el, path) {
    const tag = el.localName;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || el.inert || el.hidden || el.hasAttribute('data-canvas-omit') || ['script','style','link','iframe','noscript','source'].includes(tag)) return null;
    const svg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    if (svg && !tags.has(tag)) return null;
    const dest = svg ? document.createElementNS(el.namespaceURI, tag) : document.createElement(tags.has(tag) ? tag : 'div');
    const typed = el.computedStyleMap();
    const css = [];
    for (const prop of properties) {
      let value = typed.get(prop)?.toString() || style.getPropertyValue(prop);
      if (!value || /[<>\\]|url\s*\(|image-set\s*\(|https?:|data:/i.test(value)) continue;
      // The source app sizes its shell from visualViewport. Keep that behavior
      // when a designer switches to a preview shorter than the capture tablet.
      if (prop === 'height' && value === window.innerHeight+'px') value = '100dvh';
      if (prop === 'width' && value === window.innerWidth+'px') value = '100%';
      // Chromium resolves grid tracks to pixels. Preserve the computed layout within smaller previews.
      if (prop === 'grid-template-columns' && /^([\d.]+px )+[\d.]+px$/.test(value))
        value = value.split(' ').map(v => 'minmax(0,' + parseFloat(v) + 'fr)').join(' ');
      css.push([prop, value]);
    }
    const signature = JSON.stringify(css);
    if (!rules.has(signature)) rules.set(signature, {cls:'qm' + rules.size, css});
    dest.setAttribute('class', rules.get(signature).cls);
    for (const [prop,value] of css) {
      if (!common.has(prop)) common.set(prop,new Map());
      const values = common.get(prop);
      values.set(value,(values.get(value) || 0)+1);
    }
    for (const attr of attributes) if (el.hasAttribute(attr)) {
      const value = el.getAttribute(attr);
      if (!/url\(/i.test(value)) dest.setAttribute(attr, value);
    }
    if (tag === 'input' && ['checkbox','radio','number','email','text'].includes(el.type)) dest.setAttribute('type', el.type);
    if (tag === 'img' || tag === 'canvas') {
      if (tag === 'img' && !el.naturalWidth) return null;
      const width = tag === 'img' ? el.naturalWidth : el.width;
      const height = tag === 'img' ? el.naturalHeight : el.height;
      if (width && height) {
        const scale = Math.min(1, 200 / Math.max(width,height));
        const bitmap = document.createElement('canvas');
        bitmap.width = Math.max(1, Math.round(width*scale)); bitmap.height = Math.max(1, Math.round(height*scale));
        bitmap.getContext('2d').drawImage(el,0,0,bitmap.width,bitmap.height);
        const image = tag === 'img' ? dest : document.createElement('img');
        image.src = bitmap.toDataURL('image/webp', 0.75);
        if (image !== dest) dest.append(image);
      }
    }
    if (!svg) {
      // A structural ID remains stable when only a label or its styling changes.
      dest.setAttribute('data-node-id', 'n-' + path);
      if (el.dataset.canvasTarget) {
        const key = el.dataset.canvasEdge;
        const label = (el.getAttribute('aria-label') || el.innerText).replace(/\s+/g,' ').trim();
        dest.setAttribute('data-node-id', key);
        actions.push({ id:key, elementId:key, label, type:'navigate', targetId:el.dataset.canvasTarget });
      }
    }
    let i = 0;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) dest.append(document.createTextNode(child.textContent));
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const result = clone(child, path + '-' + i++);
        if (result) dest.append(result);
      }
    }
    return dest;
  }
  const html = clone(root,'0').outerHTML;
  const defaults = new Map([...common].map(([prop,values]) => [prop,[...values].sort((a,b)=>b[1]-a[1])[0][0]]));
  const declarations = entries => entries.map(([prop,value]) => prop+':'+value).join(';');
  const css = 'body{margin:0} :where([class^=qm]){' + declarations([...defaults]) + '}\n' +
    [...rules.values()].map(({cls,css}) => '.' + cls + '{' + declarations(css.filter(([p,v])=>defaults.get(p)!==v)) + '}').join('\n');
  return {id, name, purpose:purpose || name, html, css, actions, overlays:[], states:[], status:'draft'};
}
