import sys

with open("index.html", "r") as f:
    c = f.read()

# 1. CSS
c = c.replace(
    "@media(max-width:680px){.n-links{display:none}}",
    ".n-ham{display:none;background:none;border:none;color:inherit;font-size:24px;cursor:pointer}\n@media(max-width:680px){\n  .n-links{position:fixed;top:0;right:-100%;width:100%;height:100vh;background:rgba(245,240,232,.98);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:right .4s cubic-bezier(.2,.7,.2,1);z-index:99;font-size:16px;gap:40px}\n  .n-links.open{right:0}\n  .n-ham{display:block;z-index:101}\n}"
)

c = c.replace(
    "@media(max-width:580px){.trust-g{grid-template-columns:repeat(2,1fr)}.tc:nth-child(odd){border-right:.5px solid var(--rule)}.tc{border-bottom:.5px solid var(--rule)}}",
    "@media(max-width:580px){.trust-g{grid-template-columns:repeat(2,1fr)}.tc:nth-child(odd){border-right:.5px solid var(--rule)}.tc{border-bottom:.5px solid var(--rule)}.tc:nth-last-child(-n+2){border-bottom:none}}"
)

# 2. HTML
c = c.replace(
    '<nav id="nav">\n  <a href="#top" class="n-logo">Dmytro Bilynets</a>\n  <div class="n-links"><a href="#work">Work</a><a href="#about">About</a><a href="#booking">Book</a></div>\n  <button class="n-book om">Reserve →</button>\n</nav>',
    '<nav id="nav">\n  <a href="#top" class="n-logo">Dmytro Bilynets</a>\n  <div class="n-links"><a href="#work">Work</a><a href="#about">About</a><a href="#booking">Book</a></div>\n  <div style="display:flex;align-items:center;gap:12px">\n    <button class="n-book om">Reserve →</button>\n    <button class="n-ham" id="nham" aria-label="Menu">☰</button>\n  </div>\n</nav>'
)

# Replace image paths
imgs_to_replace = [
    ('src="studio-bed-wide.jpg"', 'src="img/studio-bed-wide.jpg"'),
    ('src="healed-moth.jpg"', 'src="img/healed-moth.jpg"'),
    ('src="healed-butterfly.jpg"', 'src="img/healed-butterfly.jpg"'),
    ('src="healed-flower.jpg"', 'src="img/healed-flower.jpg"'),
    ('src="healed-bird.jpg"', 'src="img/healed-bird.jpg"'),
    ('src="healed.jpg"', 'src="img/healed.jpg"'),
    ('src="fresh.png"', 'src="img/fresh.png"'),
    ('src="dmytro.jpg"', 'src="img/dmytro.jpg"'),
    ('src="studio-roses-new.jpg"', 'src="img/studio-roses.jpg"'),
    ('src="studio-evening.jpg"', 'src="img/studio-evening.jpg"'),
    ('src="studio-photo-zone.jpg"', 'src="img/studio-photo-zone.jpg"'),
    ('src="studio-marshall.jpg"', 'src="img/studio-marshall.jpg"'),
    ('src="studio-bed-close.jpg"', 'src="img/studio-bed-close.jpg"')
]

for old, new in imgs_to_replace:
    c = c.replace(old, new)

# 3. JS
c = c.replace(
    "addEventListener('scroll',uNav,{passive:true});uNav();",
    "addEventListener('scroll',uNav,{passive:true});uNav();\n\nconst nham=document.getElementById('nham'), nlinks=document.querySelector('.n-links');\nif(nham){\n  nham.addEventListener('click', () => {\n    nlinks.classList.toggle('open');\n    nham.textContent = nlinks.classList.contains('open') ? '✕' : '☰';\n  });\n  document.querySelectorAll('.n-links a').forEach(l => l.addEventListener('click', () => {\n    nlinks.classList.remove('open');\n    nham.textContent = '☰';\n  }));\n}"
)

old_wdots = """const wtr=document.getElementById('wtr'),wdots=document.querySelectorAll('.wd');
document.querySelectorAll('.wfb').forEach(b=>b.addEventListener('click',()=>{
  const f=b.dataset.f;
  document.querySelectorAll('.wfb').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  wtr.querySelectorAll('.wc').forEach(c=>c.style.display=(f==='all'||c.dataset.st===f)?'':'none');
  wtr.scrollLeft=0;
}));
wtr.addEventListener('scroll',()=>{
  const cards=[...wtr.querySelectorAll('.wc')].filter(c=>c.style.display!=='none');
  if(!cards.length)return;
  const cw=cards[0].offsetWidth+10;
  const idx=Math.min(Math.round(wtr.scrollLeft/cw),wdots.length-1);
  wdots.forEach((d,i)=>d.classList.toggle('active',i===idx));
},{passive:true});"""

new_wdots = """const wtr=document.getElementById('wtr'),wdots=document.querySelectorAll('.wd');
function updateDots() {
  const cards=[...wtr.querySelectorAll('.wc')].filter(c=>c.style.display!=='none');
  wdots.forEach((d,i) => d.style.display = i < cards.length ? '' : 'none');
  if(!cards.length)return;
  const cw=cards[0].offsetWidth+10;
  const idx=Math.min(Math.round(wtr.scrollLeft/cw),cards.length-1);
  wdots.forEach((d,i)=>d.classList.toggle('active',i===idx));
}
document.querySelectorAll('.wfb').forEach(b=>b.addEventListener('click',()=>{
  const f=b.dataset.f;
  document.querySelectorAll('.wfb').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  wtr.querySelectorAll('.wc').forEach(c=>c.style.display=(f==='all'||c.dataset.st===f)?'':'none');
  wtr.scrollLeft=0;
  updateDots();
}));
wtr.addEventListener('scroll', updateDots, {passive:true});"""

c = c.replace(old_wdots, new_wdots)

old_box = """let bop=false;
const bst=document.getElementById('bst'),bh=document.getElementById('bh'),bit=document.getElementById('bit'),bcb=document.getElementById('bcb'),bis=document.querySelectorAll('.bi');
function toggleBox(){
  bop=!bop;
  if(bop){
    bst.classList.add('open');bh.classList.add('hid');bit.classList.add('vis');
    bis.forEach((c,i)=>{c.classList.remove('hid');setTimeout(()=>c.classList.add('vis'),175+i*78)});
    bcb.classList.add('vis');
  } else {
    bis.forEach(c=>{c.classList.remove('vis');c.classList.add('hid')});
    setTimeout(()=>{bst.classList.remove('open');bit.classList.remove('vis');bcb.classList.remove('vis');bis.forEach(c=>c.classList.remove('hid'));bh.classList.remove('hid')},360);
  }
}"""

new_box = """let bop=false, bto=[];
const bst=document.getElementById('bst'),bh=document.getElementById('bh'),bit=document.getElementById('bit'),bcb=document.getElementById('bcb'),bis=document.querySelectorAll('.bi');
function toggleBox(){
  bop=!bop;
  bto.forEach(clearTimeout); bto=[];
  if(bop){
    bst.classList.add('open');bh.classList.add('hid');bit.classList.add('vis');
    bis.forEach((c,i)=>{c.classList.remove('hid'); bto.push(setTimeout(()=>c.classList.add('vis'),175+i*78))});
    bcb.classList.add('vis');
  } else {
    bis.forEach(c=>{c.classList.remove('vis');c.classList.add('hid')});
    bto.push(setTimeout(()=>{bst.classList.remove('open');bit.classList.remove('vis');bcb.classList.remove('vis');bis.forEach(c=>c.classList.remove('hid'));bh.classList.remove('hid')},360));
  }
}"""

c = c.replace(old_box, new_box)

with open("index.html", "w") as f:
    f.write(c)
