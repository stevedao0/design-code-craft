/**
 * QR Bookmarklet Source — no fetch, no API, no CORS.
 * Payload travels via URL hash #vcpmc_qr= or manual paste fallback.
 *
 * The code runs as an IIFE. The IIFE wrapping happens at the app level
 * (not in this template) so this file stays plain JS.
 */

export const qrBookmarkletSource = `(function(){
var _o='vcpmc-bookmarklet-overlay';
function _l(m){console.log('[VCPMC] '+m);}
function _s(html,bg){var el=document.getElementById(_o);if(el)el.remove();var d=document.createElement('div');d.id=_o;d.innerHTML=html;Object.assign(d.style,{position:'fixed',bottom:'20px',right:'20px',zIndex:2147483647,background:bg||'#1e40af',color:'#fff',padding:'12px 16px',borderRadius:'8px',font:'13px/1.5 sans-serif',maxWidth:'520px',boxShadow:'0 4px 16px rgba(0,0,0,0.25)',cursor:'default'});document.body.appendChild(d);return d;}
function _e(raw){raw=(raw||'').split(/[#&?]/)[0];if(!raw)return{data:null,err:null};var ts=[function(){var b=raw.replace(/-/g,'+').replace(/_/g,'/');var p=b.length%4;if(p>0)b+='='.repeat(4-p);return JSON.parse(decodeURIComponent(escape(atob(b))));},function(){var b=raw.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b))));},function(){return JSON.parse(decodeURIComponent(escape(atob(raw))));}];var err=null;for(var t=0;t<ts.length;t++){try{return{data:ts[t](),err:null};}catch(e){err=e;}}return{data:null,err:err};}
function _nl(s){if(!s)return'';return s.toLowerCase().replace(/[àáạảãâầấậẩẫăằắặẳẵ/g,'a').replace(/[èéẹẻẽêềếệểễ/g,'e').replace(/[ìíịỉĩ/g,'i').replace(/[òóọỏõôồốộổỗơờớợởỡ/g,'o').replace(/[ùúụủũưừứựửữ/g,'u').replace(/[ỳýỵỷỹ/g,'y').replace(/[đ/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function _vd(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&el.offsetParent!==null&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';}
function _setVal(el,val){if(!el||!val)return false;var tag=el.tagName.toLowerCase();if(tag==='select'){try{var si=-1;var opts=el.options;for(var oi=0;oi<opts.length;oi++){if(_nl(opts[oi].textContent||'').indexOf(_nl(val))!==-1){si=oi;break;}}if(si>=0)el.selectedIndex=si;else el.value=val;el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}return true;}else{try{var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');if(s&&s.set){s.set.call(el,val);}else{el.value=val;}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();}catch(e){}return true;}}
function _dateDDMMYYYY(s){if(!s)return'';var parts=s.split('-');if(parts.length===3)return parts[2]+'/'+parts[1]+'/'+parts[0];return s;}

var _LK=['tinh trang','linh vuc','so hop dong','so giay chung nhan','ngay in giay chung nhan','ngay bat dau','ngay ket thuc','ten don vi','dia chi','mst','ma so thue'];
var _TK=['them moi thong tin','them moi','nhap thu cong','nhap tu excel'];

function _gl(el){var txt='';if(el.getAttribute('aria-label'))txt=el.getAttribute('aria-label');else if(el.placeholder)txt=el.placeholder;else if(el.name)txt=el.name;var id=el.id;if(id){var lbl=document.querySelector('label[for="'+id+'"]');if(lbl)txt=txt||lbl.textContent||'';}var parent=el.closest('.MuiFormControl-root,.MuiTextField-root,.MuiInputBase-root,.MuiOutlinedInput-root');if(parent){var pl=parent.querySelector('label');if(pl&&pl.textContent)txt=txt||pl.textContent;var sp=parent.querySelector('span');if(sp&&sp.textContent&&sp.textContent.length<60)txt=txt||sp.textContent;}var prev=el.previousElementSibling;if(prev&&(prev.tagName==='LABEL'||prev.tagName==='SPAN'||prev.tagName==='DIV')&&prev.textContent)txt=txt||prev.textContent;if(!txt){var anc=el.parentElement;for(var i=0;i<4&&anc&&anc!==document.body;i++){var ls=anc.querySelectorAll('label,span:not([style]),p');for(var j=0;j<ls.length;j++){var lt=(ls[j].textContent||'').trim();if(lt.length>1&&lt.length<80){txt=lt;break;}}if(txt)break;anc=anc.parentElement;}}return _nl(txt);}

function _cvc(el){var sel='input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled]),.MuiInputBase-input,.MuiSelect-select,.MuiOutlinedInput-input,[contenteditable="true"]';var els=el.querySelectorAll(sel);var count=0;for(var i=0;i<els.length;i++){if(_vd(els[i]))count++;}return count;}

function _cml(el){var txt=_nl(el.textContent||'');var count=0;for(var i=0;i<_LK.length;i++){if(txt.indexOf(_LK[i])!==-1)count++;}return count;}

function _hst(el){var txt=_nl(el.textContent||'');for(var i=0;i<_TK.length;i++){if(txt.indexOf(_TK[i])!==-1)return true;}return false;}

function _sc(el){var ml=_cml(el);var vc=_cvc(el);var ht=_hst(el)?1:0;var score=ml*10+vc*2+ht*20;return{score:score,ml:ml,vc:vc,ht:ht,snip:(_nl(el.textContent||'')).substring(0,200),tag:el.tagName.toLowerCase(),cls:el.className.substring(0,80)};}

function _scan(){var cands=[];function add(el){if(!el||el===document.body||el===document.documentElement)return;if(!_vd(el))return;var r=el.getBoundingClientRect();if(r.width<200||r.height<150)return;cands.push(_sc(el));}var sel='[role="dialog"],.MuiModal-root,.MuiDialog-root,.MuiPaper-root,.MuiBox-root,form,.modal,.modal-content,[class*="form"],[class*="add"],[class*="dialog"],[class*="modal"]';document.querySelectorAll(sel).forEach(add);var divs=document.querySelectorAll('div');for(var i=0;i<divs.length;i++){var dv=divs[i];if(_vd(dv)){var r=dv.getBoundingClientRect();if(r.width>400&&r.height>300)add(dv);}}cands.sort(function(a,b){return b.score-a.score;});return cands;}

function _fro(){var cs=_scan();_l('Cands: '+cs.length);for(var i=0;i<cs.length&&i<5;i++){_l('C['+i+'] s='+cs[i].score+' vc='+cs[i].vc+' ml='+cs[i].ml+' ht='+cs[i].ht);}var best=null;for(var j=0;j<cs.length;j++){if(cs[j].vc>=5&&cs[j].ml>=4&&cs[j].score>=30){best=cs[j];break;}}if(!best){for(var k=0;k<cs.length;k++){if(cs[k].vc>=5&&cs[k].score>=20){best=cs[k];break;}}}if(!best){for(var m=0;m<cs.length;m++){if(cs[m].score>0&&cs[m].vc>=3){best=cs[m];break;}}}if(best){_l('Root: s='+best.score+' vc='+best.vc);var all=document.querySelectorAll('[role="dialog"],.MuiModal-root,.MuiDialog-root,.MuiPaper-root,.MuiBox-root,form,.modal,.modal-content,[class*="form"],[class*="add"],div');for(var n=0;n<all.length;n++){var el=all[n];if(_vd(el)&&_sc(el).score===best.score)return el;}}return document.body;}

function _frs(ts,tc,tm){var all=document.querySelectorAll('[role="dialog"],.MuiModal-root,.MuiDialog-root,.MuiPaper-root,.MuiBox-root,form,.modal,.modal-content,[class*="form"],[class*="add"],div');for(var i=0;i<all.length;i++){var el=all[i];if(!_vd(el))continue;var s=_sc(el);if(s.score===ts&&s.vc===tc&&s.ml===tm)return el;}return null;}

function _cf(root){var result=[];var sel='input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled]),.MuiInputBase-input,.MuiSelect-select,.MuiOutlinedInput-input,[contenteditable="true"]';var els=root.querySelectorAll(sel);for(var i=0;i<els.length;i++){var el=els[i];if(!_vd(el))continue;var tag=el.tagName.toLowerCase();var type=el.type||'';var role=el.getAttribute('role')||'';var lbl=_gl(el);var val=el.value||'';var ph=el.placeholder||'';result.push({el:el,tag:tag,type:type,role:role,label:lbl,placeholder:ph,value:val});}return result;}

function _fab(){var sel=['a[href*="ad/add"]','a[href*="/ad/add"]','[onclick*="ad/add"]','[aria-label*="them moi"]','[aria-label*="add new"]','[title*="them moi"]','[title*="add new"]','[id*="btnAdd"]','[id*="btn-add"]','[id*="addNew"]','.btn-add','.btn-add-new','button[class*="add"]','button[class*="them"]'];for(var si=0;si<sel.length;si++){var bs=document.querySelectorAll(sel[si]);for(var bi=0;bi<bs.length;bi++){var b=bs[bi];if(b.offsetParent!==null&&!b.disabled)return b;}}return null;}

function _ifo(){var cs=_scan();for(var i=0;i<cs.length;i++){if(cs[i].vc>=5&&cs[i].ml>=3)return{cs:cs.slice(0,10),best:cs[i]};}return null;}

function _dbg(cands){if(!cands||cands.length===0)return'';window._vcdbg={url:window.location.href,cands:cands.slice(0,20).map(function(c){return{score:c.score,vc:c.vc,ml:c.ml,ht:c.ht,snip:c.snip,tag:c.tag,cls:c.cls};})};return'<br><br><button onclick="var t=JSON.stringify(window._vcdbg,null,2);navigator.clipboard.writeText(t).then(function(){var b=event.target;b.textContent=\'Copied!\';setTimeout(function(){b.textContent=\'Copy form debug\';},2000);}).catch(function(){prompt(\'Debug:\',t);})" style="background:#fff;color:#1e40af;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;font-size:11px">Copy form debug</button>';}

function _ffbtn(){return'<br><br><button onclick="var e=document.createEvent(\'Event\');e.initEvent(\'_vcpmcForceFill\',true,true);document.dispatchEvent(e);" style="background:#fbbf24;color:#000;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;font-size:11px;font-weight:bold">Force fill visible form</button>';}

function _fill(data){
  var open=_ifo();
  if(open){
    _l('Form already open');
  }else{
    _l('Clicking Add...');
    var btn=_fab();
    if(!btn){
      _s('<b style="font-size:15px">ADD_BUTTON_NOT_FOUND</b><br><span style="opacity:0.7">Khong tim nut Them moi tren trang.</span>','#7f1d1d');
      return;
    }
    btn.scrollIntoView({behavior:'smooth',block:'center'});
    btn.click();
    _l('Clicked: '+btn.tagName+(btn.id?'#'+btn.id:''));
  }

  _s('VCPMC QR Bookmarklet<br><b style="font-size:15px">Waiting Form</b><br><span style="opacity:0.7">Dang doi form xuat hien...</span>','#1e40af');

  var found=false;
  var tries=0;
  var cands=[];
  var best=null;

  function checkForm(){
    if(found)return;
    tries++;
    var cs=_scan();
    var f=false;
    for(var i=0;i<cs.length;i++){
      if(cs[i].vc>=5&&cs[i].ml>=4&&cs[i].score>=30){f=true;best=cs[i];cands=cs;break;}
    }
    if(!f){
      for(var j=0;j<cs.length;j++){
        if(cs[j].vc>=5&&cs[j].score>=20){f=true;best=cs[j];cands=cs;break;}
      }
    }
    if(f){found=true;_l('Form found try='+tries+' s='+best.score);checkForm();return;}
    if(tries<100){setTimeout(checkForm,300);}
    else{
      cands=_scan();
      var html='<b style="font-size:15px">ADD_FORM_TIMEOUT</b><br><span style="opacity:0.7">Form khong xuat hien sau 30s.</span><br><br><span style="font-size:11px;opacity:0.7">';
      if(cands.length>0){
        for(var k=0;k<Math.min(3,cands.length);k++){
          html+='C['+k+'] s='+cands[k].score+' vc='+cands[k].vc+' ml='+cands[k].ml+'<br>';
        }
      }else{html+='No candidates.';}
      html+='</span>'+_dbg(cands)+_ffbtn();
      _s(html,'#7f1d1d');
      var fh=function(){
        document.removeEventListener('_vcpmcForceFill',fh);
        _l('Force fill');
        var cs2=_scan();
        if(cs2.length===0){_s('<b>No visible containers.</b>','#7f1d1d');return;}
        var b2=null;
        for(var mi=0;mi<cs2.length;mi++){if(!b2||cs2[mi].vc>b2.vc)b2=cs2[mi];}
        if(b2&&b2.vc>=2){
          var rEl=_frs(b2.score,b2.vc,b2.ml);
          if(!rEl)rEl=document.body;
          var flds=_cf(rEl);
          window._vcpmcFields=flds.map(function(f,i){return{index:i,tag:f.tag,type:f.type,role:f.role,label:f.label,placeholder:f.placeholder,value:f.value};});
          if(flds.length===0){_s('<b>NO_CONTROLS_IN_FORM_ROOT</b>','#7f1d1d');return;}
          var rF=[{nl:'so hop dong',val:data.contract_no||''},{nl:'so giay chung nhan',val:data.certificate_no||''},{nl:'ngay bat dau',val:_dateDDMMYYYY(data.effective_from)},{nl:'ngay ket thuc',val:_dateDDMMYYYY(data.effective_to)}];
          var oF=[{nl:'ngay in giay chung nhan',val:_dateDDMMYYYY(data.certificate_issue_date||data.issue_date||data.cert_issue_date)},{nl:'ten don vi',val:data.organization_name||''},{nl:'dia chi',val:data.usage_address||data.address||''},{nl:'mst',val:data.tax_code||''},{nl:'linh vuc',val:data.domain||''},{nl:'tinh trang',val:'Phát hành'}];
          var filled=[];
          var missing=[];
          for(var ri=0;ri<rF.length;ri++){var rf=rF[ri];if(!rf.val){missing.push(rf.nl);continue;}var m=false;for(var fi=0;fi<flds.length;fi++){var fd=flds[fi];if(!fd.label&&!fd.placeholder)continue;if(fd.label.indexOf(rf.nl)!==-1||fd.placeholder.indexOf(rf.nl)!==-1){if(_setVal(fd.el,rf.val)){filled.push(rf.nl);}m=true;break;}}if(!m&&rf.val)missing.push(rf.nl);}
          for(var oi=0;oi<oF.length;oi++){var of=oF[oi];if(!of.val)continue;for(var fi=0;fi<flds.length;fi++){var fd=flds[fi];if(!fd.label&&!fd.placeholder)continue;if(fd.label.indexOf(of.nl)!==-1||fd.placeholder.indexOf(of.nl)!==-1){_setVal(fd.el,of.val);filled.push(of.nl);break;}}}
          var cbtn='<br><br><button onclick="navigator.clipboard.writeText(JSON.stringify(window._vcpmcFields,null,2))" style="background:#fff;color:#1e40af;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;font-size:11px">Copy detected fields</button>';
          if(filled.length===0){_s('<b>FORCE_FIELD_MATCH_FAILED</b><br>'+cbtn,'#7f1d1d');return;}
          if(missing.length>0){_s('<b>PARTIAL_FILL (FORCE)</b><br><span style="color:#fca5a5">'+filled.length+' truong.</span><br>Thieu: '+missing.join(', ')+cbtn,'#f59e0b');}else{_s('<b>DONE (FORCE)</b><br><span style="color:#86efac">'+filled.length+' truong.</span>'+cbtn,'#14532d');}
        }else{
          _s('<b>Khong tim container co control.</b>','#7f1d1d');
        }
      };
      document.addEventListener('_vcpmcForceFill',fh);
    }
  }
  checkForm();

  var timer=setInterval(function(){
    if(!found)return;
    clearInterval(timer);
    var root=null;
    if(best)root=_frs(best.score,best.vc,best.ml);
    if(!root)root=_fro();
    if(!root||root===document.body||root===document.documentElement){
      var cs2=_scan();
      for(var ci=0;ci<cs2.length;ci++){if(cs2[ci].vc>=3){root=_frs(cs2[ci].score,cs2[ci].vc,cs2[ci].ml);if(root&&root!==document.body)break;}}
    }
    if(!root||root===document.body||root===document.documentElement)root=document.body;
    var fields=_cf(root);
    _l('Fields: '+fields.length);
    window._vcpmcFields=fields.map(function(f,i){return{index:i,tag:f.tag,type:f.type,role:f.role,label:f.label,placeholder:f.placeholder,value:f.value};});
    _s('VCPMC QR Bookmarklet<br><b style="font-size:15px">Form Found</b><br><span style="opacity:0.7">Tim thay '+fields.length+' truong. Dang dien...</span>','#1e40af');
    setTimeout(function(){
      var rF=[{nl:'so hop dong',val:data.contract_no||''},{nl:'so giay chung nhan',val:data.certificate_no||''},{nl:'ngay bat dau',val:_dateDDMMYYYY(data.effective_from)},{nl:'ngay ket thuc',val:_dateDDMMYYYY(data.effective_to)}];
      var oF=[{nl:'ngay in giay chung nhan',val:_dateDDMMYYYY(data.certificate_issue_date||data.issue_date||data.cert_issue_date)},{nl:'ten don vi',val:data.organization_name||''},{nl:'dia chi',val:data.usage_address||data.address||''},{nl:'mst',val:data.tax_code||''},{nl:'linh vuc',val:data.domain||''},{nl:'tinh trang',val:'Phát hành'}];
      var filled=[];
      var missing=[];
      for(var ri=0;ri<rF.length;ri++){var rf=rF[ri];if(!rf.val){missing.push(rf.nl);continue;}var m=false;for(var fi=0;fi<fields.length;fi++){var fd=fields[fi];if(!fd.label&&!fd.placeholder)continue;if(fd.label.indexOf(rf.nl)!==-1||fd.placeholder.indexOf(rf.nl)!==-1){_l('Match: ['+rf.nl+'] -> ['+fd.label+']');if(_setVal(fd.el,rf.val)){filled.push(rf.nl);}m=true;break;}}if(!m&&rf.val)missing.push(rf.nl);}
      for(var oi=0;oi<oF.length;oi++){var of=oF[oi];if(!of.val)continue;for(var fi=0;fi<fields.length;fi++){var fd=fields[fi];if(!fd.label&&!fd.placeholder)continue;if(fd.label.indexOf(of.nl)!==-1||fd.placeholder.indexOf(of.nl)!==-1){_l('Opt: ['+of.nl+'] -> ['+fd.label+']');_setVal(fd.el,of.val);filled.push(of.nl);break;}}}
      var cbtn='<br><br><button onclick="navigator.clipboard.writeText(JSON.stringify(window._vcpmcFields,null,2))" style="background:#fff;color:#1e40af;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;font-size:11px">Copy detected fields</button>';
      if(filled.length===0){_s('<b>FIELD_MATCH_FAILED</b><br><span style="opacity:0.7">'+fields.length+' truong. Khong khop payload.</span>'+cbtn,'#7f1d1d');return;}if(missing.length>0){_s('<b>PARTIAL_FILL</b><br><span style="color:#fca5a5">'+filled.length+' truong.</span><br>Thieu: '+missing.join(', ')+'<br><br>'+cbtn,'#f59e0b');}else{_s('<b style="font-size:15px">DONE</b><br><span style="color:#86efac">'+filled.length+' truong.</span><br><br><span style="opacity:0.7">Kiem tra va bam Luu tren portal.</span>'+cbtn,'#14532d');}
    },1500);
  },300);
}
_s('VCPMC QR Bookmarklet<br><b style="font-size:15px">Started</b><br><span style="opacity:0.7">Doc payload tu URL...</span>','#1e40af');_l('BM started.');
var h=window.location.hash;var idx=h.indexOf('vcpmc_qr=');var raw=null;
if(idx!==-1){raw=h.substring(idx+10);_l('Hash found');}else{_l('No hash');var pasted=null;try{pasted=window.prompt('Khong thay du lieu QR tren URL.\\n\\nQuay lai app In GCN, bam Copy payload code, sau do dan vao o nay.\\n(Chuoi base64 dai).\\nDe trong de huy.');}catch(e){pasted=null;}if(!pasted||!pasted.trim()){_s('<b>NO_PAYLOAD_HASH</b><br><span style="opacity:0.7">Khong co payload tren URL.</span>','#7f1d1d');return;}raw=pasted.trim();}
var dec=_e(raw);
if(!dec.data){_l('Decode failed');var retry=null;try{retry=window.prompt('Loi giai ma payload.\\n\\nHay dan lai payload code tu app In GCN.\\n(Chuoi base64 dai).\\nDe trong de huy.');}catch(e){retry=null;}if(retry&&retry.trim())dec=_e(retry.trim());if(!dec.data){_s('<b>PAYLOAD_DECODE_FAILED</b><br><span style="color:#fca5a5">Loi giai ma payload.</span>','#7f1d1d');return;}}
_l('Decoded OK. Fill...');
_fill(dec.data);
})`;

// Minimal boot-only bookmarklet for Phase 2 testing.
// Shows overlay immediately, does NOT attempt form fill.
export const qrBookmarkletSourceBootOnly = `(function(){
var _o='vcpmc-bookmarklet-overlay';
function _s(html,bg){var el=document.getElementById(_o);if(el)el.remove();var d=document.createElement('div');d.id=_o;d.innerHTML=html;Object.assign(d.style,{position:'fixed',bottom:'20px',right:'20px',zIndex:2147483647,background:bg||'#1e40af',color:'#fff',padding:'12px 16px',borderRadius:'8px',font:'13px/1.5 sans-serif',maxWidth:'420px',boxShadow:'0 4px 16px rgba(0,0,0,0.25)',cursor:'default'});document.body.appendChild(d);return d;}
function _e(raw){raw=(raw||'').split(/[#&?]/)[0];if(!raw)return{data:null,err:null};var ts=[function(){var b=raw.replace(/-/g,'+').replace(/_/g,'/');var p=b.length%4;if(p>0)b+='='.repeat(4-p);return JSON.parse(decodeURIComponent(escape(atob(b))));},function(){var b=raw.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b))));},function(){return JSON.parse(decodeURIComponent(escape(atob(raw))));}];var err=null;for(var t=0;t<ts.length;t++){try{return{data:ts[t](),err:null};}catch(e){err=e;}}return{data:null,err:err};}
_s('VCPMC QR Bookmarklet<br><b style="font-size:15px">Started</b><br><span style="opacity:0.7">Doc payload tu URL...</span>','#1e40af');
var h=window.location.hash;var idx=h.indexOf('vcpmc_qr=');var raw=null;
if(idx!==-1){raw=h.substring(idx+10);}
if(!raw){
  var pasted=null;
  try{pasted=window.prompt('Khong thay du lieu QR tren URL.\\n\\nQuay lai app In GCN, bam Copy payload code, dan vao day.\\nDe trong de huy.');}catch(e){pasted=null;}
  if(!pasted||!pasted.trim()){_s('<b style="font-size:15px">NO_PAYLOAD_HASH</b><br><span style="opacity:0.7">Khong co payload tren URL.</span>','#7f1d1d');return;}
  raw=pasted.trim();
}
var dec=_e(raw);
if(!dec.data){
  var retry=null;
  try{retry=window.prompt('Loi giai ma payload. Dan lai payload code tu app In GCN.');}catch(e){retry=null;}
  if(retry&&retry.trim())dec=_e(retry.trim());
  if(!dec.data){_s('<b style="font-size:15px">PAYLOAD_DECODE_FAILED</b><br><span style="color:#fca5a5">Loi giai ma payload.</span>','#7f1d1d');return;}
}
_s('<b style="font-size:15px">PAYLOAD_DECODED</b><br><span style="color:#86efac">Payload hop le. Fill form chua implement trong boot-only.</span><br><span style="opacity:0.7">contract_no: '+(dec.data.contract_no||'-')+'<br>certificate_no: '+(dec.data.certificate_no||'-')+'</span>','#14532d');
})`;
