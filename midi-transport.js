// Input-only, opt-in MIDI transport. No Web MIDI permission or output access.
"use strict";
window.KeyMemoryMidiTransport = {
  create({storage, onAction=()=>{}, onChange=()=>{}}={}) {
    const actions=["record","stop","play","practice","continue","transposeDown","transposeUp"], storageKey="keymemory.midiTransport.v1";
    const down=new Set(), quarantined=new Set(), boundaries=new Set();
    let enabled=false, learning=null, mappings={}, error="";
    if(storage===undefined){try{storage=window.localStorage;}catch{storage=null;}}
    const valid=m=>m&&["note","control"].includes(m.kind)&&Number.isInteger(m.number)&&m.number>=0&&m.number<=(m.kind==="control"?119:127)&&Number.isInteger(m.channel)&&m.channel>=0&&m.channel<16;
    const key=m=>`${m.kind}:${m.channel}:${m.number}`;
    const copy=m=>({kind:m.kind,number:m.number,channel:m.channel});
    try {
      const saved=JSON.parse(storage?.getItem(storageKey)||"null");
      if(saved?.version===1&&typeof saved.enabled==="boolean"&&saved.mappings&&typeof saved.mappings==="object"){
        const seen=new Set();
        for(const action of actions){const m=saved.mappings[action];if(valid(m)&&!seen.has(key(m))){mappings[action]=copy(m);seen.add(key(m));}}
        enabled=saved.enabled;
      }
    }catch{}
    const getState=()=>({enabled,learning,mappings:JSON.parse(JSON.stringify(mappings)),error});
    function notify(persist=false){
      if(persist)try{storage?.setItem(storageKey,JSON.stringify({version:1,enabled,mappings}));}catch{error="Settings could not be saved; they work for this session.";}
      onChange(getState());
    }
    function boundary(){for(const k of down)quarantined.add(k);for(const fn of boundaries)fn();}
    function setMapping(action,m){
      if(!actions.includes(action)||!valid(m)){error="Choose a note or ordinary CC (0–119) on a MIDI channel.";notify();return false;}
      const conflict=actions.find(a=>a!==action&&mappings[a]&&key(mappings[a])===key(m));
      if(conflict){error=`This input is already assigned to ${conflict}. Remove that assignment first.`;notify();return false;}
      mappings[action]=copy(m);learning=null;error="";boundary();notify(true);return true;
    }
    function handle(event){
      const note=event.kind==="on"||event.kind==="off", control=event.kind==="control";
      if(!note&&!control)return false;
      const m={kind:note?"note":"control",number:note?event.note:event.controller,channel:event.channel};
      if(!Number.isInteger(m.number)||m.number<0||m.number>127||!Number.isInteger(m.channel)||m.channel<0||m.channel>15)return false;
      const k=key(m), high=note?event.kind==="on"&&event.velocity!==0:event.value>=64;
      const wasDown=down.has(k), wasQuarantined=quarantined.has(k);
      if(high)down.add(k);else{down.delete(k);quarantined.delete(k);}
      const action=actions.find(a=>mappings[a]&&key(mappings[a])===k);
      if(learning){
        // Every event is isolated from the recorder, sound and grading while learning.
        if(high&&!wasDown&&!wasQuarantined&&event.focused!==false&&event.active!==false){
          if(valid(m))setMapping(learning,m);
          else{error="Channel-mode CC 120–127 cannot be assigned. Choose a note or ordinary CC.";notify();}
        }
        // After learning ends, consume this input through release even after cancel/disable.
        if(high)quarantined.add(k);
        return true;
      }
      if(wasQuarantined)return true;
      if(!enabled||!action)return false;
      if(high&&!wasDown&&event.focused!==false&&event.active!==false)onAction(action,event);
      return true;
    }
    return {
      getState,handle,setMapping,
      setEnabled(value){if(typeof value!=="boolean")return false;if(enabled===value)return true;enabled=value;learning=null;error="";boundary();notify(true);return true;},
      learn(action){if(!actions.includes(action))return false;learning=action;error="";boundary();notify();return true;},
      cancelLearn(){if(!learning)return;learning=null;error="";boundary();notify();},
      removeMapping(action){if(!actions.includes(action))return false;delete mappings[action];if(learning===action)learning=null;error="";boundary();notify(true);return true;},
      subscribeBoundary(fn){boundaries.add(fn);return()=>boundaries.delete(fn);},
      suspend(){boundary();if(learning){learning=null;notify();}},
      reset(){down.clear();quarantined.clear();if(learning){learning=null;notify();}}
    };
  }
};
