// Input-only Web MIDI adapter. Permission is requested only by Connect MIDI.
"use strict";
window.KeyMemoryMidi = {
  create({onNote, onRelease=()=>{}, onReset=()=>{}, onConnect=()=>{}, onRaw=()=>false, onSuspend=()=>{}, onConnection=()=>{}, status, select, connect, disconnect}) {
    let access=null, input=null, desiredId=null, generation=0, pending=false, binding=0;
    let waitingForRelease=false, boundary=performance.now(), failedPort=null, focused=true;
    const held=new Set();
    const say=text=>{status.textContent=text;onConnection(Boolean(input&&input.state==="connected"));};
    const clearHeld=()=>{held.clear();waitingForRelease=false;onReset();};
    function detach() {
      if(input)onSuspend("MIDI input changed or disconnected");
      binding++;
      if(input){input.onmidimessage=null;try{Promise.resolve(input.close()).catch(()=>{});}catch{}}
      input=null;clearHeld();
    }
    function resetQuestion() {
      // Keep physically held notes quarantined across question/mode boundaries.
      // Releases always pass through, including while dialogs/background are open.
      boundary=performance.now();waitingForRelease=held.size>0;onReset();
    }
    function bind(port) {
      detach();input=port;
      if(!port)return;
      const token=generation, bindingToken=binding;
      port.onmidimessage=event=>{
        if(token!==generation||bindingToken!==binding||input!==port||port.state!=="connected")return;
        const data=event.data;
        if(!data||data.length!==3)return;
        const [command,note,velocity]=data,kind=command&0xf0,channel=command&0xf;
        if((kind!==0x80&&kind!==0x90)||note>127||velocity>127)return;
        const key=channel+":"+note;
        const stamp=event.timeStamp,clock=performance.now();
        const time=Number.isFinite(stamp)&&stamp>0&&stamp<=clock+1000?Date.now()-Math.max(0,clock-stamp):Date.now();
        const intercepted=onRaw({kind:kind===0x80||velocity===0?"off":"on",note,velocity,channel,focused,time});
        if(kind===0x80||velocity===0){
          held.delete(key);
          if(![...held].some(k=>Number(k.split(":")[1])===note))onRelease(note,channel);
          if(!held.size)waitingForRelease=false;
          return;
        }
        if(held.has(key))return;
        const samePitchHeld=[...held].some(k=>Number(k.split(":")[1])===note);
        held.add(key);
        if(intercepted||!focused||waitingForRelease||samePitchHeld||(event.timeStamp>0&&event.timeStamp<boundary))return;
        onNote(note,channel);
      };
      say("Connected: "+(port.name||"MIDI keyboard")+". Release held keys before each new question.");
      try{Promise.resolve(port.open()).catch(()=>{
        if(input!==port||bindingToken!==binding||token!==generation)return;
        failedPort=port;detach();say("Could not open this MIDI input. Select another input or reconnect.");
      });}catch{failedPort=port;detach();say("Could not open this MIDI input. Reconnect to try again.");}
    }
    function refresh() {
      if(!access)return;
      const ports=[...access.inputs.values()].filter(p=>p.state==="connected");
      if(failedPort&&!ports.includes(failedPort))failedPort=null;
      select.replaceChildren();
      for(const port of ports){const option=document.createElement("option");option.value=port.id;option.textContent=port.name||"MIDI keyboard";select.append(option);}
      select.disabled=!ports.length;
      if(!ports.length){detach();say("No MIDI inputs detected. Connect your keyboard by USB; this list updates automatically.");return;}
      // Do not silently switch to another device if the selected keyboard unplugs.
      let port=desiredId?ports.find(p=>p.id===desiredId):null;
      if(desiredId&&!port){
        const option=document.createElement("option");option.value=desiredId;option.textContent="Selected input disconnected — reconnect or choose another";select.prepend(option);select.value=desiredId;
        detach();say("MIDI input disconnected. Reconnect it or choose another input.");return;
      }
      port ||= ports.find(p=>/YC\s*Series.*Port\s*1/i.test(p.name||""))||ports[0];
      desiredId=port.id;select.value=port.id;
      if(port===failedPort){say("Could not open this MIDI input. Select another input or reconnect.");return;}
      if(input!==port)bind(port);
    }
    function stop() {
      generation++;pending=false;
      if(access)access.onstatechange=null;
      access=null;desiredId=null;failedPort=null;detach();select.replaceChildren();select.disabled=true;
      connect.disabled=false;disconnect.hidden=true;say("MIDI disconnected. Connect when you are ready.");
    }
    async function start() {
      if(pending||access)return;
      if(!window.isSecureContext){say("MIDI needs a secure HTTPS page. Open the live KeyMemory site.");return;}
      if(typeof navigator.requestMIDIAccess!=="function"){say("Web MIDI is unavailable here. Use a current Chrome or Edge browser on your Mac.");return;}
      const token=++generation;pending=true;connect.disabled=true;disconnect.hidden=false;
      say("Waiting for MIDI permission…");onConnect();
      try {
        const result=await navigator.requestMIDIAccess({sysex:false});
        if(token!==generation)return;
        access=result;pending=false;
        access.onstatechange=()=>{if(token===generation)refresh();};refresh();
      }catch(error){
        if(token!==generation)return;
        pending=false;connect.disabled=false;disconnect.hidden=true;
        say(error?.name==="NotAllowedError"||error?.name==="SecurityError"?"MIDI permission was denied or blocked. You can keep using the screen piano; allow MIDI in browser site settings before reconnecting.":"MIDI could not connect. Check the keyboard connection and try Connect MIDI again.");
      }
    }
    connect.addEventListener("click",start);disconnect.addEventListener("click",stop);
    select.addEventListener("change",()=>{if(!access)return;failedPort=null;desiredId=select.value;refresh();});
    window.addEventListener("blur",()=>{focused=false;onSuspend("Window lost focus");resetQuestion();});
    window.addEventListener("focus",()=>{focused=true;resetQuestion();});
    document.addEventListener("visibilitychange",()=>{if(document.hidden){onSuspend("Page hidden");resetQuestion();}});
    window.addEventListener("pagehide",stop);
    select.disabled=true;disconnect.hidden=true;
    say(!window.isSecureContext?"MIDI needs HTTPS.":typeof navigator.requestMIDIAccess!=="function"?"Web MIDI unavailable — use Chrome or Edge on your Mac.":"Not connected. MIDI access is requested only when you choose Connect MIDI.");
    return {resetQuestion,disconnect:stop,isConnected:()=>Boolean(input&&input.state==="connected")};
  }
};
