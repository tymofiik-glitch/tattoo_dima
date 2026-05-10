import sys

with open("index.html", "r") as f:
    c = f.read()

old_css = """
.sphotos{
  display:grid;
  grid-template-columns:1fr 1fr 1.45fr 0.85fr;
  grid-template-rows:clamp(160px,22vw,280px) clamp(90px,12vw,160px);
  gap:6px;
  margin-top:clamp(28px,4vw,52px);
}
.sp{overflow:hidden;position:relative;border-radius:2px;box-shadow:0 2px 12px rgba(26,24,20,.09),0 1px 3px rgba(26,24,20,.06);transition:box-shadow .35s,transform .35s;cursor:default}
.sp:hover{box-shadow:0 10px 32px rgba(26,24,20,.18),0 2px 8px rgba(26,24,20,.1);transform:translateY(-3px);z-index:2}
.sp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.sp:hover img{transform:scale(1.06)}
.sp1{grid-column:1;grid-row:1/span 2}
.sp2{grid-column:2;grid-row:1/span 2}
.sp3{grid-column:3;grid-row:1}
.sp4{grid-column:4;grid-row:1}
.sp5{grid-column:3/span 2;grid-row:2}
@media(max-width:900px){
  .sphotos{grid-template-columns:1fr 1fr;grid-template-rows:clamp(200px,36vw,300px) clamp(120px,20vw,180px);gap:5px}
  .sp1{grid-column:1;grid-row:1/span 2}
  .sp2{grid-column:2;grid-row:1}
  .sp3{grid-column:2;grid-row:2}
  .sp4{display:none}.sp5{display:none}
}
@media(max-width:560px){
  .sphotos{grid-template-columns:1fr 1fr;grid-template-rows:180px 100px;gap:4px}
  .sp1{grid-column:1;grid-row:1/span 2}
  .sp2{grid-column:2;grid-row:1}
  .sp3{grid-column:2;grid-row:2}
  .sp4{display:none}.sp5{display:none}
}
"""

new_css = """
.sphotos{
  position:relative;
  width:100%;
  aspect-ratio:3/4;
  margin-top:clamp(28px,4vw,52px);
}
@media(min-width:680px){
  .sphotos{aspect-ratio:16/9}
}
.sp{
  position:absolute;
  inset:0;
  overflow:hidden;
  cursor:default;
}
.sp img{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
  transition:transform .6s cubic-bezier(.2,.7,.2,1);
}
.sp:hover{z-index:2}
.sp:hover img{transform:scale(1.06)}
.sp1{clip-path:polygon(0 0, calc(65% - 2px) 0, calc(55% - 2px) calc(40% - 2px), 0 calc(46% - 2px))}
.sp2{clip-path:polygon(calc(65% + 2px) 0, 100% 0, 100% calc(55% - 2px), calc(55% + 2px) calc(40% - 2px))}
.sp3{clip-path:polygon(0 calc(46% + 2px), calc(55% - 2px) calc(40% + 2px), calc(48% - 2px) calc(68% - 2px), 0 calc(75% - 2px))}
.sp4{clip-path:polygon(0 calc(75% + 2px), calc(48% - 2px) calc(68% + 2px), calc(53% - 2px) 100%, 0 100%)}
.sp5{clip-path:polygon(calc(55% + 2px) calc(40% + 2px), 100% calc(55% + 2px), 100% 100%, calc(53% + 2px) 100%, calc(48% + 2px) calc(68% + 2px))}
"""

old_html = """  <div class="sphotos rev d2">
    <div class="sp sp1">
      <img src="img/studio-roses.jpg" alt="Studio — roses and sculptures" style="object-position:center 25%"/>
    </div>
    <div class="sp sp2">
      <img src="img/studio-evening.jpg" alt="Studio — evening light and paintings" style="object-position:center 20%"/>
    </div>
    <div class="sp sp3">
      <img src="img/studio-photo-zone.jpg" alt="Studio — photo zone with curtains" style="object-position:center 35%"/>
    </div>
    <div class="sp sp4">
      <img src="img/studio-marshall.jpg" alt="Studio — Marshall speaker and details" style="object-position:center 40%"/>
    </div>
    <div class="sp sp5">
      <img src="img/studio-bed-close.jpg" alt="Studio — tattoo bed" style="object-position:center 30%"/>
    </div>
  </div>"""

new_html = """  <div class="sphotos rev d2">
    <div class="sp sp1">
      <img src="img/studio-marshall.jpg" alt="Studio — Marshall speaker" style="object-position:center 30%"/>
    </div>
    <div class="sp sp2">
      <img src="img/studio-evening.jpg" alt="Studio — paintings" style="object-position:center 20%"/>
    </div>
    <div class="sp sp3">
      <img src="img/studio-photo-zone.jpg" alt="Studio — photo zone" style="object-position:center 35%"/>
    </div>
    <div class="sp sp4">
      <img src="img/studio-roses.jpg" alt="Studio — roses and sculptures" style="object-position:center 25%"/>
    </div>
    <div class="sp sp5">
      <img src="img/studio-bed-close.jpg" alt="Studio — tattoo bed" style="object-position:center 30%"/>
    </div>
  </div>"""

c = c.replace(old_css.strip(), new_css.strip())
c = c.replace(old_html.strip(), new_html.strip())

with open("index.html", "w") as f:
    f.write(c)

