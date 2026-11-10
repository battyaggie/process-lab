/* Shared drag-and-drop vocabulary exercise.
   Usage: DragDropVocab.mount(containerElement, "/exercise/sheet/vocab.json")
   Data: {storageKey, picture, pictureAlt, intro, parts:[{n,name}], wordBoxOrder:[names], detail:{text,image,alt}} */
(function(){
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}

  function mount(root,url){
    root.textContent="Loading…";
    fetch(url).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
      .then(function(d){build(root,d)})
      .catch(function(){root.textContent="The vocabulary exercise could not be loaded. Please reload the page."});
  }

  function build(root,d){
    var key=d.storageKey||"dnd";
    var placed={}, texts={};
    try{placed=JSON.parse(store(key+"-placed")||"{}")}catch(e){}
    try{texts=JSON.parse(store(key+"-text")||"{}")}catch(e){}
    var answer={}; d.parts.forEach(function(p){answer[p.n]=p.name});
    var names=(d.wordBoxOrder&&d.wordBoxOrder.length?d.wordBoxOrder:d.parts.map(function(p){return p.name}));
    var selected=null, dragged=null;

    root.textContent=""; root.className="dnd";
    if(d.intro&&d.showIntro)root.appendChild(el("p","lead",d.intro));
    var top=el("div","dnd-top"); root.appendChild(top);
    /* keep the pinned frame directly below the page's sticky header, whatever its height */
    function syncTop(){var t=document.getElementById("topbar");root.style.setProperty("--dnd-top",(t?Math.ceil(t.getBoundingClientRect().height):0)+"px")}
    syncTop(); window.addEventListener("resize",syncTop);
    var tb=document.getElementById("topbar");
    if(tb&&window.ResizeObserver)new ResizeObserver(syncTop).observe(tb);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(syncTop);
    var pics=d.pictures&&d.pictures.length?d.pictures:[{src:d.picture,alt:d.pictureAlt||"",size:d.pictureSize}];
    var pic=el("img","dnd-pic");
    function showPic(i){var p=pics[i];pic.src=p.src;pic.alt=p.alt||"";
      if(p.size){pic.width=p.size[0];pic.height=p.size[1]}else{pic.removeAttribute("width");pic.removeAttribute("height")}}
    if(pics.length>1){
      var tabs=el("div","dnd-tabs"); tabs.setAttribute("role","tablist"); var tbtn=[];
      pics.forEach(function(p,i){
        var t=el("button","dnd-tab",p.label||("View "+(i+1))); t.type="button"; t.setAttribute("role","tab");
        t.addEventListener("click",function(){tbtn.forEach(function(x,j){x.setAttribute("aria-selected",j===i?"true":"false")});showPic(i)});
        tbtn.push(t); tabs.appendChild(t); (new Image()).src=p.src;
      });
      tbtn[0].setAttribute("aria-selected","true"); tbtn.slice(1).forEach(function(x){x.setAttribute("aria-selected","false")});
      top.appendChild(tabs);
    }
    /* wide, flat pictures can be short; taller pictures need more height so the numbers stay readable */
    function fit(){var r=pic.naturalWidth&&pic.naturalHeight?pic.naturalWidth/pic.naturalHeight:3.5;
      pic.style.maxHeight=r>=3.2?"min(22vh,220px)":"min(30vh,300px)"}
    pic.addEventListener("load",fit);
    showPic(0); top.appendChild(pic);
    var box=el("div","dnd-box"); box.appendChild(el("h2","","Word box"));
    var chips=el("div","dnd-chips"); chips.setAttribute("role","group"); chips.setAttribute("aria-label","Word box");
    box.appendChild(chips);
    var status=el("p","dnd-status"); status.setAttribute("role","status"); status.setAttribute("aria-live","polite"); box.appendChild(status);
    var again=el("button","btn quiet","Start again"); again.type="button";
    top.appendChild(box);

    var table=el("table","dnd-table"); var thead=el("thead"); var hr=el("tr");
    ["No.","Name of the part","What does it do?"].forEach(function(h){hr.appendChild(el("th","",h))});
    thead.appendChild(hr); table.appendChild(thead);
    var tb=el("tbody"); table.appendChild(tb);
    var cells={};
    d.parts.forEach(function(p){
      var tr=el("tr"); tr.appendChild(el("td","no",String(p.n)));
      var td=el("td","nm"); var cell=el("div","dnd-cell","drop here"); cell.tabIndex=0; cell.setAttribute("role","button");
      cell.setAttribute("aria-label","Row "+p.n+": name of the part. Empty.");
      cell.dataset.n=p.n; cells[p.n]=cell; td.appendChild(cell); tr.appendChild(td);
      var td2=el("td"); var inp=el("textarea","dnd-do"); inp.rows=1; inp.setAttribute("aria-label","What does part "+p.n+" do?");
      inp.value=texts[p.n]||"";
      inp.addEventListener("input",function(){texts[p.n]=inp.value;store(key+"-text",JSON.stringify(texts))});
      td2.appendChild(inp); tr.appendChild(td2); tb.appendChild(tr);

      cell.addEventListener("dragover",function(e){if(!placed[p.n]){e.preventDefault();cell.classList.add("over")}});
      cell.addEventListener("dragleave",function(){cell.classList.remove("over")});
      cell.addEventListener("drop",function(e){e.preventDefault();cell.classList.remove("over");
        var nm=dragged||(e.dataTransfer&&e.dataTransfer.getData("text/plain"));attempt(p.n,nm)});
      cell.addEventListener("click",function(){if(selected)attempt(p.n,selected)});
      cell.addEventListener("keydown",function(e){if((e.key==="Enter"||e.key===" ")&&selected){e.preventDefault();attempt(p.n,selected)}});
    });
    root.appendChild(table);
    var tools=el("div"); tools.appendChild(again); root.appendChild(tools);

    if(d.detail){
      var det=el("div","dnd-detail"); det.appendChild(el("h2","", "Look at the steps in more detail"));
      det.appendChild(el("p","",d.detail.text));
      (d.detail.images||[d.detail.image]).forEach(function(src){var di=el("img","dnd-pic"); di.src=src; di.alt=d.detail.alt||""; det.appendChild(di)});
      root.appendChild(det);
    }

    function used(nm){for(var n in placed){if(placed[n]===nm)return true}return false}
    function say(msg,good){status.textContent=msg;status.className="dnd-status"+(good?" good":"")}
    function save(){store(key+"-placed",JSON.stringify(placed))}
    function paintChips(){
      chips.textContent="";
      names.forEach(function(nm){
        if(used(nm))return;
        var c=el("button","dnd-chip",nm); c.type="button"; c.draggable=true;
        c.setAttribute("aria-pressed",selected===nm?"true":"false");
        c.addEventListener("dragstart",function(e){dragged=nm;c.classList.add("dragging");
          try{e.dataTransfer.setData("text/plain",nm);e.dataTransfer.effectAllowed="move"}catch(x){}});
        c.addEventListener("dragend",function(){dragged=null;c.classList.remove("dragging")});
        c.addEventListener("click",function(){selected=(selected===nm?null:nm);paintChips();
          if(selected)say("Selected: "+nm+". Now click the row where it belongs.")});
        chips.appendChild(c);
      });
    }
    function paintCells(){
      d.parts.forEach(function(p){
        var c=cells[p.n], nm=placed[p.n];
        if(nm){c.textContent=nm;c.className="dnd-cell ok";c.removeAttribute("tabindex");
          c.setAttribute("aria-label","Row "+p.n+": "+nm+", correct.")}
        else{c.textContent="drop here";c.className="dnd-cell";c.tabIndex=0;
          c.setAttribute("aria-label","Row "+p.n+": name of the part. Empty.")}
      });
    }
    function attempt(n,nm){
      if(!nm||placed[n])return;
      var c=cells[n];
      if(answer[n]===nm){
        placed[n]=nm; save(); selected=null; paintCells(); paintChips();
        var left=d.parts.filter(function(p){return !placed[p.n]}).length;
        if(left===0)say("All names are correct. Now write in your own words what each part does, then look at the stations below.",true);
        else say("Correct: "+nm+" is part "+n+".",true);
      }else{
        c.classList.remove("bad"); void c.offsetWidth; c.classList.add("bad");
        say("Not quite. "+nm+" is not part "+n+". Look at the picture again and try another row.");
        setTimeout(function(){c.classList.remove("bad")},900);
      }
    }
    again.addEventListener("click",function(){placed={};selected=null;save();paintCells();paintChips();say("")});
    paintCells(); paintChips();
    if(d.parts.every(function(p){return placed[p.n]}))say("All names are correct. Now write in your own words what each part does, then look at the stations below.",true);
  }
  window.DragDropVocab={mount:mount};
})();
