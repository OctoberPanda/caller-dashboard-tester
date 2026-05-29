// CALLER DASHBOARD TESTER v2 - Date-based persistence

const SCRIPT_URL='https://script.google.com/macros/s/AKfycbwTu3t1ybgchssRWD2HnVRaT8uEifcjMbl0xCYRMaf2ROGe-3P20zV3g_WohE__1oAq/exec';
const CFG_KEY='cdt2_config';
const LOGS_KEY='cdt2_logs';
const FLAGS_KEY='cdt2_flags';

const C={
  ROW:0,BANK:1,STATE:4,CITY:5,REG:6,AA:7,
  CEO_NAME:8,CEO_PHONE:9,CEO_EA:10,CEO_EMAIL:11,CEO_INIT_CALL:12,
  CEO_RECENT:13,CEO_TIMES:14,CEO_WHO:15,CEO_NOTES:16,CEO_OUTCOME:17,
  CRA_NAME:18,CRA_PHONE:19,CRA_EMAIL_I:20,CRA_EMAIL_R:21,CRA_INIT_CALL:22,
  CRA_RECENT:23,CRA_TIMES:24,CRA_WHO:25,CRA_NOTES:26,CRA_OUTCOME:27,
  CFO_NAME:28,CFO_PHONE:29,CFO_EMAIL_I:30,CFO_EMAIL_R:31,CFO_INIT_CALL:32,
  CFO_RECENT:33,CFO_TIMES:34,CFO_WHO:35,CFO_NOTES:36,CFO_OUTCOME:37,
};

const RC={
  CEO:{recent:C.CEO_RECENT,times:C.CEO_TIMES,who:C.CEO_WHO,notes:C.CEO_NOTES,outcome:C.CEO_OUTCOME,phone:C.CEO_PHONE,name:C.CEO_NAME,ea:C.CEO_EA,email:C.CEO_EMAIL,emailR:null},
  CRA:{recent:C.CRA_RECENT,times:C.CRA_TIMES,who:C.CRA_WHO,notes:C.CRA_NOTES,outcome:C.CRA_OUTCOME,phone:C.CRA_PHONE,name:C.CRA_NAME,ea:null,email:C.CRA_EMAIL_I,emailR:C.CRA_EMAIL_R},
  CFO:{recent:C.CFO_RECENT,times:C.CFO_TIMES,who:C.CFO_WHO,notes:C.CFO_NOTES,outcome:C.CFO_OUTCOME,phone:C.CFO_PHONE,name:C.CFO_NAME,ea:null,email:C.CFO_EMAIL_I,emailR:C.CFO_EMAIL_R},
};

const OC={
  'Expressed Interest':'green','Follow-up':'blue','Email requested/ Follow-up':'blue',
  'Left Message':'blue','Check Back Later':'amber','Open':'amber',
  'Decline':'red','Request To Unsubscribe':'red','Wrong Number':'red','Wrong Contact':'red',
  "Not the bank's fund type":'red',
};

let cfg={},banks=[],logs={},flags={},openRI=null,logCtx=null,flagCtx=null,undoCtx=null,workDate='';

window.onload=()=>{
  cfg=loadCfg();logs=loadLogs();flags=loadFlags();
  workDate=cfg.lastWorkDate||initWorkDate();
  if(!cfg.sheetId||!cfg.tab||!cfg.apiKey||!cfg.name){show('setup-screen');prefillSetup();}
  else{show('main-app');boot();}
};

function prefillSetup(){
  sv('s-name',cfg.name||'');sv('s-sheet-id',cfg.sheetId||'');sv('s-tab',cfg.tab||'');
  sv('s-update-id',cfg.updateSheetId||'');sv('s-update-tab',cfg.updateTab||'');sv('s-api-key',cfg.apiKey||'');
}
function saveSetup(){
  const name=gv('s-name').trim(),sheetId=gv('s-sheet-id').trim(),tab=gv('s-tab').trim();
  const updateSheetId=gv('s-update-id').trim(),updateTab=gv('s-update-tab').trim(),apiKey=gv('s-api-key').trim();
  if(!name||!sheetId||!tab||!apiKey){toast('Please fill in all required fields','error');return;}
  cfg={name,sheetId,tab,updateSheetId,updateTab,apiKey,lastWorkDate:workDate};
  saveCfg();show('main-app');boot();
}
function boot(){
  st('rep-badge',cfg.name);
  if(!workDate)workDate=initWorkDate();
  el('work-date').value=workDate;
  loadSheet();
}
function onDateChange(){
  workDate=gv('work-date').trim();
  if(!workDate)return;
  cfg.lastWorkDate=workDate;saveCfg();
  // Close any open card
  if(openRI){
    const pb=el('body-'+openRI),pc=el('chev-'+openRI);
    if(pb){pb.classList.remove('open');pb.innerHTML='';}
    if(pc)pc.classList.remove('open');
    openRI=null;
  }
  renderStats();
  applyFilters();
}
function initWorkDate(){
  const now=new Date();
  const et=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
  return `${et.getMonth()+1}/${et.getDate()}/${et.getFullYear()}`;
}
function workDateDisplay(){
  return workDate||'';
}

async function loadSheet(){
  el('bank-list').innerHTML='<div class="loading">Loading your sheet...</div>';
  if(!workDate)workDate=initWorkDate();
  el('work-date').value=workDate;
  const range=encodeURIComponent("'"+cfg.tab+"'");
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${range}?key=${cfg.apiKey}`;
  try{
    const res=await fetch(url);const data=await res.json();
    if(data.error){el('bank-list').innerHTML=`<div class="loading error">❌ ${data.error.message}<br><br>Check Sheet ID, tab name, and API key in ⚙️ Settings.</div>`;return;}
    const rows=data.values||[];
    banks=rows.slice(2).map((row,i)=>({ri:i+3,d:row})).filter(b=>b.d[C.BANK]&&String(b.d[C.BANK]).trim());
    renderStats();buildStateFilter();renderList(visibleBanks());
    checkRestoredBanks();
  }catch(e){el('bank-list').innerHTML='<div class="loading error">❌ Network error. Check your API key and connection.</div>';}
}

function bankId(ri){const b=banks.find(x=>x.ri===ri);return b?String(b.d[C.BANK]||'').trim().toUpperCase():'UNKNOWN_'+ri;}
function logKey(ri){return workDate+'__'+bankId(ri);}
function logsForDate(ri,role){
  const all=(logs[logKey(ri)]||[]).filter(l=>!l.deleted);
  return role?all.filter(l=>l.role===role):all;
}
function allLogsForDate(){
  const prefix=workDate+'__';
  return Object.entries(logs).filter(([k])=>k.startsWith(prefix)).flatMap(([,v])=>v.filter(l=>!l.deleted));
}
function bankCalledToday(ri){return logsForDate(ri).length>0;}
function bankComplete(ri){return['CEO','CRA','CFO'].every(r=>logsForDate(ri,r).length>0);}
function bankIncomplete(ri){const c=['CEO','CRA','CFO'].filter(r=>logsForDate(ri,r).length>0).length;return c>0&&c<3;}
function pendingRoles(ri){return['CEO','CRA','CFO'].filter(r=>logsForDate(ri,r).length===0);}
function isDeclinedToday(ri){return allLogsForDate().some(l=>l.ri===ri&&l.outcome==='Decline');}
function isDeclinedSheet(ri){const b=banks.find(x=>x.ri===ri);if(!b)return false;return['CEO','CRA','CFO'].some(r=>b.d[RC[r].outcome]==='Decline');}
function isDeclined(ri){return isDeclinedToday(ri)||isDeclinedSheet(ri);}

function parsePhones(str){if(!str||!String(str).trim())return[];return String(str).split(/[;,]/).map(p=>p.trim()).filter(Boolean);}
const BAD_KW=['black box','dead air','wrong number','not in service','fax machine','did not hear','unidentifiable'];
function isPhoneBad(ri,role,phone){
  const bid=bankId(ri);const f=flags[bid+'_'+role+'_'+phone];if(f&&!f.undone)return true;
  const b=banks.find(x=>x.ri===ri);if(!b)return false;
  const n=String(b.d[RC[role].notes]||'').toLowerCase();
  return n.includes(phone.toLowerCase())&&BAD_KW.some(k=>n.includes(k));
}
function getBadReason(ri,role,phone){
  const bid2=bankId(ri);const f=flags[bid2+'_'+role+'_'+phone];if(f&&!f.undone)return f.issue;
  const b=banks.find(x=>x.ri===ri);if(!b)return'';
  const n=String(b.d[RC[role].notes]||'');
  const issues=['Black box VM','Dead air','Wrong number','Not in service','Fax machine','Did not hear full name','Unidentifiable VM'];
  for(const i of issues)if(n.toLowerCase().includes(i.toLowerCase()))return i;
  return'Bad number';
}
function mostRecentEmail(d,role){
  if(role==='CEO')return d[C.CEO_EMAIL]||'';
  const a=d[role==='CRA'?C.CRA_EMAIL_I:C.CFO_EMAIL_I]||'';
  const b=d[role==='CRA'?C.CRA_EMAIL_R:C.CFO_EMAIL_R]||'';
  if(!a)return b;if(!b)return a;
  try{return new Date(b)>new Date(a)?b:a;}catch{return b||a;}
}

function renderStats(){
  const all=allLogsForDate();
  const dials=all.length;
  const banksReached=new Set(all.filter(l=>l.outcome!=='No Answer').map(l=>l.ri)).size;
  const peopleReached=new Set(all.filter(l=>l.who&&l.who!=='NO CONTACT').map(l=>l.ri+'_'+l.role)).size;
  const completeCnt=banks.filter(b=>bankComplete(b.ri)).length;
  const sosCnt=Object.values(flags).filter(f=>!f.undone).length;
  const decToday=new Set(all.filter(l=>l.outcome==='Decline').map(l=>l.ri)).size;
  const activeCnt=banks.filter(b=>!isDeclined(b.ri)).length;
  st('st-dials',dials);st('st-reached',banksReached);st('st-people',peopleReached);
  st('st-complete',completeCnt);st('st-sos',sosCnt);st('st-declined',decToday);st('st-total',activeCnt);
}

function buildStateFilter(){
  const sel=el('f-state');
  const states=[...new Set(banks.map(b=>b.d[C.STATE]).filter(Boolean))].sort();
  sel.innerHTML='<option value="">All states</option>';
  states.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
}

function visibleBanks(){
  const status=gv('f-status');
  if(status==='declined-all')return banks.filter(b=>isDeclined(b.ri));
  return banks.filter(b=>!isDeclinedSheet(b.ri));
}

function applyFilters(){
  const search=gv('search').toLowerCase(),state=gv('f-state'),status=gv('f-status');
  let pool=visibleBanks();
  const result=pool.filter(b=>{
    const ri=b.ri,name=String(b.d[C.BANK]||'').toLowerCase();
    if(search&&!name.includes(search))return false;
    if(state&&b.d[C.STATE]!==state)return false;
    if(status==='called-today')return bankCalledToday(ri);
    if(status==='not-called-today')return!bankCalledToday(ri)&&!isDeclined(ri);
    if(status==='incomplete')return bankIncomplete(ri);
    if(status==='complete')return bankComplete(ri);
    if(status==='sos')return Object.keys(flags).some(k=>k.startsWith(bankId(ri)+'_')&&!flags[k].undone);
    if(status==='interest')return logsForDate(ri).some(l=>l.outcome==='Expressed Interest')||['CEO','CRA','CFO'].some(r=>b.d[RC[r].outcome]==='Expressed Interest');
    if(status==='declined-today')return isDeclinedToday(ri);
    if(status==='attention')return['CEO','CRA','CFO'].some(r=>{
      const rl=logsForDate(ri,r);
      return rl.filter(l=>l.outcome==='No Answer').length>=2||rl.filter(l=>['Left Message','Follow-up','Email requested/ Follow-up','Check Back Later'].includes(l.outcome)).length>=7;
    });
    return true;
  });
  renderList(result);
}

function renderList(list){
  const container=el('bank-list');
  const activeCount=banks.filter(b=>!isDeclinedSheet(b.ri)).length;
  st('filter-count',list.length+' of '+activeCount+' active banks');
  if(!list.length){container.innerHTML='<div class="loading">No banks match your filter.</div>';return;}
  container.innerHTML='';list.forEach(b=>container.appendChild(buildCard(b)));
}

function buildCard(b){
  const ri=b.ri,d=b.d;
  const declined=isDeclined(ri),decToday=isDeclinedToday(ri),called=bankCalledToday(ri);
  const complete=bankComplete(ri),incomplete=bankIncomplete(ri);
  const hasSOS=Object.keys(flags).some(k=>k.startsWith(bankId(ri)+'_')&&!flags[k].undone);
  const hasInt=logsForDate(ri).some(l=>l.outcome==='Expressed Interest')||['CEO','CRA','CFO'].some(r=>d[RC[r].outcome]==='Expressed Interest');
  const pending=pendingRoles(ri);
  let badges='';
  if(decToday)badges+='<span class="badge badge-red">Declined today</span>';
  else if(declined)badges+='<span class="badge badge-red">Declined</span>';
  if(complete)badges+='<span class="badge badge-amber">Complete</span>';
  else if(incomplete){pending.forEach(r=>{badges+='<span class="badge badge-pending">'+r+' pending</span>';});}
  else if(called){badges+='<span class="badge badge-green">Called today</span>';pending.forEach(r=>{badges+='<span class="badge badge-pending">'+r+' pending</span>';});}
  if(hasSOS)badges+='<span class="badge badge-red">SOS</span>';
  if(hasInt)badges+='<span class="badge badge-green">Interest</span>';
  const card=document.createElement('div');
  card.className='bank-card'+(hasSOS?' has-sos':'')+(hasInt?' has-interest':'')+(complete?' is-complete':'')+(declined?' is-declined':'');
  card.id='card-'+ri;
  card.innerHTML='<div class="bank-card-header" onclick="toggleCard('+ri+')"><div class="bank-left"><span class="row-num">Row '+ri+'</span><div><div class="bank-name">'+esc(d[C.BANK])+'</div><div class="bank-meta">'+[d[C.CITY],d[C.STATE]].filter(Boolean).join(', ')+(d[C.REG]?' · '+d[C.REG]:'')+(d[C.AA]?' · '+String(d[C.AA]).trim():'')+'</div></div></div><div class="bank-right">'+badges+'<span class="chevron" id="chev-'+ri+'">▼</span></div></div><div class="bank-body" id="body-'+ri+'"></div>';
  return card;
}

function toggleCard(ri){
  if(openRI&&openRI!==ri){const pb=el('body-'+openRI),pc=el('chev-'+openRI);if(pb){pb.classList.remove('open');pb.innerHTML='';}if(pc)pc.classList.remove('open');}
  const body=el('body-'+ri),chev=el('chev-'+ri),isOpen=body.classList.contains('open');
  if(isOpen){body.classList.remove('open');body.innerHTML='';chev.classList.remove('open');openRI=null;}
  else{body.classList.add('open');chev.classList.add('open');openRI=ri;renderBody(ri);}
}

function renderBody(ri){
  const b=banks.find(x=>x.ri===ri);if(!b)return;
  const d=b.d,body=el('body-'+ri),dec=isDeclined(ri);
  const emails=['CEO','CRA','CFO'].map(r=>{const dt=mostRecentEmail(d,r);return dt?r+': '+fmtSheetDate(dt):'';}).filter(Boolean);
  const emailRow=emails.length?'<div class="email-row">📧 Most recent email — '+emails.join(' · ')+'</div>':'';
  const grid='<div class="leads-grid">'+['CEO','CRA','CFO'].map(r=>buildLeadCard(ri,d,r,dec)).join('')+'</div>';
  body.innerHTML='<div style="padding:12px 14px">'+emailRow+grid+'</div>';
}

function buildLeadCard(ri,d,role,bankDeclined){
  const rc=RC[role],name=d[rc.name]||'—',phones=parsePhones(d[rc.phone]);
  const outcome=d[rc.outcome]||'',notes=d[rc.notes]||'',recent=d[rc.recent]?fmtSheetDate(d[rc.recent]):'',times=d[rc.times]||'0';
  const ea=rc.ea!=null?(d[rc.ea]||''):'';
  const rLogs=logsForDate(ri,role),called=rLogs.length>0;
  const hasSOS=phones.some(p=>isPhoneBad(ri,role,p));
  const hasInt=rLogs.some(l=>l.outcome==='Expressed Interest')||outcome==='Expressed Interest';
  const oc=OC[outcome]||'';
  const statusTag=called?'<span class="complete-tag">Called</span>':'<span class="pending-tag">Pending</span>';
  let attn='';
  const noAns=rLogs.filter(l=>l.outcome==='No Answer').length;
  const conf=rLogs.filter(l=>['Left Message','Follow-up','Email requested/ Follow-up','Check Back Later'].includes(l.outcome)).length;
  if(noAns>=2)attn+='<div class="attention-flag">'+noAns+'x no answer — flag at EOD</div>';
  if(conf>=7)attn+='<div class="attention-flag">'+conf+'x confirmed attempts — flag at EOD</div>';
  let phonesHtml='';
  if(phones.length){
    phonesHtml='<div class="phones">'+phones.map((ph,pi)=>{
      const bad=isPhoneBad(ri,role,ph),reason=bad?getBadReason(ri,role,ph):'';
      return '<div class="phone-row"><div style="flex:1;min-width:0"><span class="phone-num'+(bad?' bad':'')+'">'
        +esc(ph)+'</span>'+(bad&&reason?'<span class="bad-reason">'+esc(reason)+'</span>':'')+'</div>'
        +'<div class="phone-btns"><button class="btn-copy" onclick="copyPhone(\''+esc(ph)+'\',this)">📋</button>'
        +(bad?'<button class="btn-undo" onclick="openUndoFlag('+ri+',\''+role+'\','+pi+')">↩ Undo flag</button>'
             :'<button class="btn-flag-num" onclick="openFlagModal('+ri+',\''+role+'\','+pi+')">Flag</button>')
        +(!bankDeclined?'<button class="btn-log-sm" onclick="openLogModal('+ri+',\''+role+'\','+pi+')">Log</button>':'')
        +'</div></div>';
    }).join('')+'</div>';
  }else{phonesHtml='<div class="no-phone">No phone on file</div>';}
  const notesHtml=notes?'<div class="lead-notes">'+esc(notes)+'</div>':'';
  let todayHtml='';
  if(rLogs.length){
    todayHtml='<div class="today-logs">'+rLogs.map(l=>'<div class="today-log"><span class="outcome-chip '+(OC[l.outcome]||'')+'">'+esc(l.outcome)+'</span>'
      +(l.who!=='NO CONTACT'?'<span style="font-size:10px;color:var(--text3)">'+esc(l.who)+'</span>':'')
      +'<span class="log-note-text">'+esc(l.noteText||'')+'</span>'
      +'<button class="btn-undo" onclick="openUndoLog('+ri+',\''+role+'\',\''+l.id+'\')">↩ Undo</button></div>').join('')
      +'<button class="btn-del-all" onclick="openUndoAllLogs('+ri+',\''+role+'\')">Undo all today for '+role+'</button></div>';
  }
  let bottomAction='';
  if(bankDeclined){
    bottomAction='<div class="declined-note">Bank declined — calling stopped</div>';
    if(isDeclinedToday(ri))bottomAction+='<button class="btn-undo-decline" onclick="openUndoDecline('+ri+')">↩ Undo decline</button>';
  }else{
    bottomAction='<button class="btn-log-call" onclick="openLogModal('+ri+',\''+role+'\',0)">+ Log call</button>';
  }
  return '<div class="lead-card'+(hasSOS?' sos':'')+(hasInt?' interest':'')+(called?' complete-lead':'')+(bankDeclined?' declined-lead':'')+'"><div class="lead-header"><div class="lead-header-left"><div class="lead-role-row"><span class="role-tag">'+role+'</span>'+statusTag+(outcome?'<span class="outcome-chip '+oc+'">'+esc(outcome)+'</span>':'')+'</div><div class="lead-name">'+esc(name)+'</div>'+(ea?'<div class="lead-ea">EA: '+esc(ea)+'</div>':'')+'</div><div class="lead-header-right">'+(recent?'Last: '+recent+'<br>':'')+times+'x total</div></div><div class="lead-body">'+attn+phonesHtml+notesHtml+todayHtml+bottomAction+'</div></div>';
}

function copyPhone(phone,btn){
  navigator.clipboard.writeText(phone).then(()=>{const o=btn.textContent;btn.textContent='✓';setTimeout(()=>btn.textContent=o,1500);})
  .catch(()=>{const ta=document.createElement('textarea');ta.value=phone;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);const o=btn.textContent;btn.textContent='✓';setTimeout(()=>btn.textContent=o,1500);});
}

function openLogModal(ri,role,phoneIdx){
  logCtx={ri,role,phoneIdx};
  const b=banks.find(x=>x.ri===ri);if(!b)return;
  st('log-title',b.d[C.BANK]);st('log-sub','Row '+ri+' · '+role+': '+(b.d[RC[role].name]||'—')+' · '+workDateDisplay());
  el('l-who').value='NO CONTACT';el('l-outcome').value='No Answer';
  sv('l-spoke-to','');sv('l-new-number','');sv('l-notes','');
  el('decline-warn').classList.add('hidden');el('btn-tressika').classList.add('hidden');
  el('log-modal').classList.remove('hidden');
}
function closeLogModal(){el('log-modal').classList.add('hidden');logCtx=null;}
function checkLogWarnings(){
  const o=gv('l-outcome');
  el('decline-warn').classList.toggle('hidden',o!=='Decline');
  el('btn-tressika').classList.toggle('hidden',o!=='Expressed Interest'&&o!=='Email requested/ Follow-up');
}

async function saveLog(){
  if(!logCtx)return;
  const {ri,role}=logCtx;
  const outcome=gv('l-outcome'),who=gv('l-who'),spokeTo=gv('l-spoke-to').trim(),newNum=gv('l-new-number').trim(),notesTxt=gv('l-notes').trim();
  if(outcome==='Decline'){if(!confirm('Confirm decline for '+(banks.find(x=>x.ri===ri)?.d[C.BANK]||'')+'?\n\nThis stops ALL calling at this bank.'))return;}
  const b=banks.find(x=>x.ri===ri),d=b.d,rc=RC[role],dateStr=workDateDisplay();
  const existingNotes=String(d[rc.notes]||''),dateInNotes=existingNotes.includes(dateStr);
  const parts=[];
  if(notesTxt)parts.push(notesTxt);if(spokeTo)parts.push('Spoke to: '+spokeTo);
  if(newNum)parts.push('New number: '+newNum);if(outcome==='Decline')parts.push('DECLINED — all calling stopped');
  let noteEntry='';
  if(parts.length){noteEntry=dateInNotes?parts.join('. ')+'.':dateStr+'\n'+parts.join('. ')+'.';}
  if(noteEntry)d[rc.notes]=existingNotes?existingNotes+'\n'+noteEntry:noteEntry;
  d[rc.recent]=dateStr;d[rc.times]=String((parseInt(d[rc.times])||0)+1);d[rc.outcome]=outcome;d[rc.who]=who;
  if(newNum)d[rc.phone]=d[rc.phone]?d[rc.phone]+'; '+newNum:newNum;
  if(outcome==='Decline'){
    ['CEO','CRA','CFO'].filter(r=>r!==role).forEach(r=>{
      const orc=RC[r],on=String(d[orc.notes]||'');
      const dn=on.includes(dateStr)?'DECLINED.':dateStr+'\nDECLINED.';
      d[orc.notes]=on?on+'\n'+dn:dn;
    });
  }
  // Save snapshot of fields BEFORE this log so undo can restore them
  const before={
    recent: d[rc.recent]||'',
    times:  String((parseInt(d[rc.times])||0)),  // before increment
    outcome:d[rc.outcome]||'',
    who:    d[rc.who]||'',
    notes:  String(d[rc.notes]||'').split('\n').filter(l=>l.trim()!==noteEntry).join('\n'),
  };
  const logEntry={id:genId(),ri,role,who,outcome,noteEntry,noteText:parts.join(' · ')||'',spokeTo,newNum,date:workDate,forTressika:false,deleted:false,before};
  const key=logKey(ri);if(!logs[key])logs[key]=[];logs[key].push(logEntry);saveLogs();
  const updates=[{row:ri,col:rc.recent,value:d[rc.recent]},{row:ri,col:rc.times,value:d[rc.times]},{row:ri,col:rc.who,value:d[rc.who]},{row:ri,col:rc.outcome,value:d[rc.outcome]},{row:ri,col:rc.notes,value:d[rc.notes]}];
  if(newNum)updates.push({row:ri,col:rc.phone,value:d[rc.phone]});
  await writeSheet(updates);
  if(outcome==='Decline'){await writeSheet(['CEO','CRA','CFO'].filter(r=>r!==role).map(r=>({row:ri,col:RC[r].notes,value:d[RC[r].notes]})));}
  renderStats();closeLogModal();rebuildCard(ri,outcome==='Decline');
  toast(outcome==='Decline'?'Bank marked declined':'Call logged ✓','success');
}

function flagTressika(){
  const ri=logCtx?.ri,role=logCtx?.role;if(!ri)return;
  const key=logKey(ri);const rLogs=(logs[key]||[]).filter(l=>!l.deleted&&l.role===role);
  if(rLogs.length)rLogs[rLogs.length-1].forTressika=true;
  saveLogs();renderStats();closeLogModal();toast('Flagged for Tressika ✓','success');
  if(openRI===ri)renderBody(ri);
}

function openFlagModal(ri,role,phoneIdx){
  const b=banks.find(x=>x.ri===ri);if(!b)return;
  const phones=parsePhones(b.d[RC[role].phone]),phone=phones[phoneIdx]||'';
  flagCtx={ri,role,phone};
  st('flag-title',b.d[C.BANK]);st('flag-sub','Flag bad number — '+role+': '+phone);
  el('flag-modal').classList.remove('hidden');
}
function closeFlagModal(){el('flag-modal').classList.add('hidden');flagCtx=null;}

async function saveFlag(){
  if(!flagCtx)return;
  const {ri,role,phone}=flagCtx,issue=gv('f-issue');
  const b=banks.find(x=>x.ri===ri),d=b.d,rc=RC[role],dateStr=workDateDisplay();
  const existingNotes=String(d[rc.notes]||''),dateInNotes=existingNotes.includes(dateStr);
  const badLine=phone+' '+issue;
  const key=logKey(ri);const rLogs=(logs[key]||[]).filter(l=>!l.deleted&&l.role===role);
  const lastLog=rLogs[rLogs.length-1];
  let noteEntry;
  if(lastLog&&lastLog.noteEntry){
    lastLog.noteEntry=lastLog.noteEntry.replace(/\.$/,'')+'\n'+badLine+'.';noteEntry=lastLog.noteEntry;saveLogs();
    d[rc.notes]=rebuildNotes(existingNotes,rLogs,dateStr);
  }else{
    noteEntry=dateInNotes?badLine+'.':dateStr+'\n'+badLine+'.';
    d[rc.notes]=existingNotes?existingNotes+'\n'+noteEntry:noteEntry;
  }
  flags[bankId(ri)+'_'+role+'_'+phone]={ri,role,phone,issue,undone:false};saveFlags();
  await writeSheet([{row:ri,col:rc.notes,value:d[rc.notes]}]);
  await strikethrough(ri,rc.phone,phone);
  await writeContactUpdate(ri,role,phone,issue,d);
  renderStats();closeFlagModal();if(openRI===ri)renderBody(ri);toast('Number flagged','success');
}

function rebuildNotes(orig,rLogs,dateStr){
  const lines=orig.split('\n'),dateIdx=lines.findIndex(l=>l.trim()===dateStr.trim());
  const preToday=dateIdx>-1?lines.slice(0,dateIdx).join('\n'):orig;
  const todayLines=rLogs.map(l=>l.noteEntry).filter(Boolean);
  // Only add date block if there are actual notes — no orphaned date stamps
  const todayBlock=todayLines.length?dateStr+'\n'+todayLines.join('\n'):'';
  return[preToday,todayBlock].filter(Boolean).join('\n').trim();
}

// UNDO SYSTEM
function openUndoLog(ri,role,id){
  const b=banks.find(x=>x.ri===ri),log=(logs[logKey(ri)]||[]).find(l=>l.id===id);if(!log)return;
  undoCtx={type:'log',ri,role,id};
  st('undo-desc','Undo "'+log.outcome+'" logged for '+role+' at '+(b?.d[C.BANK]||'')+'?\n\nThis removes the entry and reverses the sheet update.');
  el('undo-modal').classList.remove('hidden');
}
function openUndoAllLogs(ri,role){
  const b=banks.find(x=>x.ri===ri);undoCtx={type:'allLogs',ri,role};
  st('undo-desc','Undo ALL today\'s entries for '+role+' at '+(b?.d[C.BANK]||'')+'?');
  el('undo-modal').classList.remove('hidden');
}
function openUndoFlag(ri,role,phoneIdx){
  const b=banks.find(x=>x.ri===ri),phones=parsePhones(b?.d[RC[role].phone]||''),phone=phones[phoneIdx]||'';
  undoCtx={type:'flag',ri,role,phone};
  st('undo-desc','Undo bad number flag for '+phone+' ('+role+' at '+(b?.d[C.BANK]||'')+')?');
  el('undo-modal').classList.remove('hidden');
}
function openUndoDecline(ri){
  const b=banks.find(x=>x.ri===ri);undoCtx={type:'decline',ri};
  st('undo-desc','Undo the decline for '+(b?.d[C.BANK]||'')+'?\n\nThis bank will become active again.');
  el('undo-modal').classList.remove('hidden');
}
function closeUndoModal(){el('undo-modal').classList.add('hidden');undoCtx=null;}
async function confirmUndo(){
  if(!undoCtx)return;const{type,ri,role,id,phone}=undoCtx;closeUndoModal();
  if(type==='log')await undoLog(ri,role,id);
  if(type==='allLogs')await undoAllLogs(ri,role);
  if(type==='flag')await undoFlag(ri,role,phone);
  if(type==='decline')await undoDecline(ri);
}

async function undoLog(ri,role,id){
  const key=logKey(ri),log=(logs[key]||[]).find(l=>l.id===id);if(!log)return;
  log.deleted=true;saveLogs();
  const b=banks.find(x=>x.ri===ri),rc=RC[role];
  const remaining=(logs[key]||[]).filter(l=>!l.deleted&&l.role===role);
  b.d[rc.notes]=rebuildNotes(String(b.d[rc.notes]||''),remaining,workDateDisplay());
  b.d[rc.times]=String(Math.max(0,(parseInt(b.d[rc.times])||0)-1));
  if(remaining.length){const last=remaining[remaining.length-1];b.d[rc.outcome]=last.outcome;b.d[rc.who]=last.who;}
  // Restore from before snapshot if available, otherwise use previous remaining log
  if(log.before&&!remaining.length){
    b.d[rc.recent] =log.before.recent;
    b.d[rc.times]  =log.before.times;
    b.d[rc.outcome]=log.before.outcome;
    b.d[rc.who]    =log.before.who;
    b.d[rc.notes]  =log.before.notes;
  } else if(remaining.length){
    const last=remaining[remaining.length-1];
    b.d[rc.outcome]=last.outcome;
    b.d[rc.who]    =last.who;
    b.d[rc.recent] =workDateDisplay();
    b.d[rc.notes]  =rebuildNotes(String(b.d[rc.notes]||''),remaining,workDateDisplay());
    b.d[rc.times]  =String(Math.max(0,(parseInt(b.d[rc.times])||0)));
  }
  await writeSheet([
    {row:ri,col:rc.notes,  value:b.d[rc.notes]},
    {row:ri,col:rc.times,  value:b.d[rc.times]},
    {row:ri,col:rc.outcome,value:b.d[rc.outcome]},
    {row:ri,col:rc.who,    value:b.d[rc.who]},
    {row:ri,col:rc.recent, value:b.d[rc.recent]},
  ]);
  renderStats();rebuildCard(ri,false);toast('Entry undone','success');
}
async function undoAllLogs(ri,role){
  const key=logKey(ri);const today=(logs[key]||[]).filter(l=>l.role===role&&!l.deleted);
  today.forEach(l=>l.deleted=true);saveLogs();
  const b=banks.find(x=>x.ri===ri),rc=RC[role];
  b.d[rc.notes]=rebuildNotes(String(b.d[rc.notes]||''),[],workDateDisplay());
  b.d[rc.times]=String(Math.max(0,(parseInt(b.d[rc.times])||0)-today.length));
  // Restore from the first log's before snapshot
  const firstLog=today[0];
  if(firstLog&&firstLog.before){
    b.d[rc.recent] =firstLog.before.recent;
    b.d[rc.times]  =firstLog.before.times;
    b.d[rc.outcome]=firstLog.before.outcome;
    b.d[rc.who]    =firstLog.before.who;
    b.d[rc.notes]  =firstLog.before.notes;
  }
  await writeSheet([
    {row:ri,col:rc.notes,  value:b.d[rc.notes]},
    {row:ri,col:rc.times,  value:b.d[rc.times]},
    {row:ri,col:rc.outcome,value:b.d[rc.outcome]},
    {row:ri,col:rc.who,    value:b.d[rc.who]},
    {row:ri,col:rc.recent, value:b.d[rc.recent]},
  ]);
  renderStats();rebuildCard(ri,false);toast('All entries undone','success');
}
async function undoFlag(ri,role,phone){
  const fKey=bankId(ri)+'_'+role+'_'+phone;if(!flags[fKey])return;
  flags[fKey].undone=true;saveFlags();
  const b=banks.find(x=>x.ri===ri),rc=RC[role];
  const notes=String(b.d[rc.notes]||'').split('\n').filter(l=>!l.includes(phone)).join('\n');
  b.d[rc.notes]=notes;await writeSheet([{row:ri,col:rc.notes,value:notes}]);
  renderStats();rebuildCard(ri,false);toast('Flag removed','success');
}
async function undoDecline(ri){
  const key=logKey(ri);const dec=(logs[key]||[]).find(l=>l.outcome==='Decline'&&!l.deleted);
  if(dec){dec.deleted=true;saveLogs();}
  const b=banks.find(x=>x.ri===ri);
  for(const role of['CEO','CRA','CFO']){
    const rc=RC[role];
    const notes=String(b.d[rc.notes]||'').split('\n').filter(l=>!l.includes('DECLINED')).join('\n');
    b.d[rc.notes]=notes;b.d[rc.outcome]='';
    await writeSheet([{row:ri,col:rc.notes,value:notes},{row:ri,col:rc.outcome,value:''}]);
  }
  renderStats();rebuildCard(ri,false);toast('Decline undone — bank is active again','success');
}

async function writeContactUpdate(ri,role,phone,issue,bankData){
  if(!cfg.updateSheetId||!cfg.updateTab)return;
  try{await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'appendContactUpdate',sheetId:cfg.updateSheetId,tabName:cfg.updateTab,rowData:{rowNum:ri,bankName:bankData[C.BANK]||'',leadTitle:role==='CRA'?'CRA OFFICER':role,leadName:bankData[RC[role].name]||'',issue}})});}
  catch(e){console.error('Contact update error',e);}
}
async function writeSheet(updates){
  try{await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheetId:cfg.sheetId,tabName:cfg.tab,updates})});}
  catch(e){console.error('Write error',e);}
}
async function strikethrough(ri,phoneColIndex,badPhone){
  if(!badPhone)return;
  try{await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'strikethrough',sheetId:cfg.sheetId,tabName:cfg.tab,row:ri,col:phoneColIndex,badNumber:badPhone})});}
  catch(e){console.error('Strikethrough error',e);}
}

function showEOD(){
  const all=allLogsForDate(),appDials=all.length;
  const banksReached=new Set(all.filter(l=>l.outcome!=='No Answer').map(l=>l.ri)).size;
  const peopleReached=new Set(all.filter(l=>l.who&&l.who!=='NO CONTACT').map(l=>l.ri+'_'+l.role)).size;
  const seenConn=new Set(),connects=[];
  all.filter(l=>l.who&&l.who!=='NO CONTACT').forEach(l=>{
    if(!seenConn.has(l.ri)){seenConn.add(l.ri);const b=banks.find(x=>x.ri===l.ri);if(b)connects.push({row:l.ri,bank:b.d[C.BANK],note:l.noteText||l.outcome});}
  });
  const sosByBank={};
  Object.values(flags).filter(f=>!f.undone).forEach(f=>{
    const b=banks.find(x=>x.ri===f.ri);if(!b)return;
    const key=f.ri+'|||'+b.d[C.BANK];if(!sosByBank[key])sosByBank[key]={row:f.ri,bank:b.d[C.BANK],entries:[]};
    sosByBank[key].entries.push(f);
  });
  const declinedToday=[],seenDec=new Set();
  all.filter(l=>l.outcome==='Decline').forEach(l=>{
    if(!seenDec.has(l.ri)){seenDec.add(l.ri);const b=banks.find(x=>x.ri===l.ri);if(b)declinedToday.push({row:l.ri,bank:b.d[C.BANK],role:l.role});}
  });
  st('eod-sub',cfg.name+' · '+workDateDisplay());
  el('eod-dials').value=appDials;
  const buildText=(dials)=>{
    const cr=dials>0?((peopleReached/dials)*100).toFixed(2)+'%':'0.00%';
    let t='Today | '+workDateDisplay()+'\n';
    t+='Total Dials Made | '+dials+'\n';
    t+='EA/CRA/CEO/CFO Reached | '+peopleReached+'\n';
    t+='EA/CRA/CEO Contact Rate (%) | '+cr+'\n';
    t+='Appointments Booked | 0\n';
    t+='Appointment based on DM reached | 0.00%\n';
    t+='Appointment based on Dials | 0.00%\n';
    t+='Total Banks Reached | '+banksReached+'\n';
    t+='\nToday I reached '+peopleReached+' GK/EA/CRA/CFO/CEO\n\n';
    connects.forEach(c=>{t+='Row '+c.row+' — '+c.bank+' — '+c.note.replace(/\.$/,'')+'.\n';});
    if(declinedToday.length){t+='\nBanks Declined Today\n\n';declinedToday.forEach(x=>{t+='Row '+x.row+' — '+x.bank+' — declined by '+x.role+'\n';});}
    if(Object.keys(sosByBank).length){
      t+='\nFlagged Numbers Report\n\n';
      Object.values(sosByBank).forEach(sb=>{
        t+='Row '+sb.row+' — '+sb.bank+'\n';
        const byRole={};sb.entries.forEach(e=>{if(!byRole[e.role])byRole[e.role]=[];byRole[e.role].push(e);});
        Object.entries(byRole).forEach(([role,entries])=>{entries.forEach(e=>{t+=role+': '+e.phone+' | '+e.issue+'\n';});});
        t+='\n';
      });
    }
    return t.trim();
  };
  el('eod-text').textContent=buildText(appDials);
  el('eod-dials').oninput=function(){el('eod-text').textContent=buildText(parseInt(this.value)||appDials);};
  el('eod-modal').classList.remove('hidden');
}
function closeEOD(){el('eod-modal').classList.add('hidden');}
function copyReport(){navigator.clipboard.writeText(el('eod-text').textContent).then(()=>toast('Report copied ✓','success')).catch(()=>toast('Select text and copy manually','error'));}

function clearTodayLogs(){
  if(!confirm('Clear all logged calls for '+workDateDisplay()+'?\n\nThis resets your stats. It does not undo anything already written to the sheet.'))return;
  const prefix=workDate+'__';
  Object.keys(logs).filter(k=>k.startsWith(prefix)).forEach(k=>{(logs[k]||[]).forEach(l=>l.deleted=true);});
  saveLogs();renderStats();if(openRI)renderBody(openRI);renderList(visibleBanks());toast('Day cleared','success');
}

function showSettings(){
  sv('set-name',cfg.name||'');sv('set-sheet-id',cfg.sheetId||'');sv('set-tab',cfg.tab||'');
  sv('set-update-id',cfg.updateSheetId||'');sv('set-update-tab',cfg.updateTab||'');sv('set-api-key',cfg.apiKey||'');
  el('settings-modal').classList.remove('hidden');
}
function closeSettings(){el('settings-modal').classList.add('hidden');}
function saveSettings(){
  cfg.name=gv('set-name').trim();cfg.sheetId=gv('set-sheet-id').trim();cfg.tab=gv('set-tab').trim();
  cfg.updateSheetId=gv('set-update-id').trim();cfg.updateTab=gv('set-update-tab').trim();cfg.apiKey=gv('set-api-key').trim();
  saveCfg();closeSettings();st('rep-badge',cfg.name);toast('Settings saved — reloading...','success');setTimeout(()=>loadSheet(),500);
}

function rebuildCard(ri,removeFromList){
  const b=banks.find(x=>x.ri===ri),old=el('card-'+ri);if(!old)return;
  if(removeFromList&&!['declined-today','declined-all'].includes(gv('f-status'))){old.remove();return;}
  const nc=buildCard(b);old.replaceWith(nc);
  const nb=el('body-'+ri);
  if(nb&&openRI===ri){nb.classList.add('open');el('chev-'+ri)?.classList.add('open');renderBody(ri);}
}

function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY))||{};}catch{return{};}}
function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(cfg));}
function loadLogs(){try{return JSON.parse(localStorage.getItem(LOGS_KEY))||{};}catch{return{};}}
function saveLogs(){localStorage.setItem(LOGS_KEY,JSON.stringify(logs));}
function loadFlags(){try{return JSON.parse(localStorage.getItem(FLAGS_KEY))||{};}catch{return{};}}
function saveFlags(){localStorage.setItem(FLAGS_KEY,JSON.stringify(flags));}

function el(id){return document.getElementById(id);}
function gv(id){return el(id)?.value||'';}
function sv(id,v){const e=el(id);if(e)e.value=v||'';}
function st(id,v){const e=el(id);if(e)e.textContent=v;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function show(id){['setup-screen','main-app'].forEach(s=>{const e=el(s);if(e)e.classList.toggle('hidden',s!==id);});}
function fmtSheetDate(v){if(!v)return'';try{const d=new Date(v);return isNaN(d)?String(v):(d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear();}catch{return String(v);}}
function toast(msg,type=''){const e=el('toast');e.textContent=msg;e.className='toast'+(type?' '+type:'');e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),2500);}

// ── RESTORED BANKS DETECTION ─────────────
// Called after sheet loads — checks if any bank has old logs from a previous date
function checkRestoredBanks() {
  // Get all log keys that are NOT from today
  const todayPrefix = workDate + '__';
  const restoredBanks = [];

  Object.keys(logs).forEach(key => {
    if (key.startsWith(todayPrefix)) return; // today's logs — skip
    const entries = (logs[key] || []).filter(l => !l.deleted);
    if (!entries.length) return;

    // Extract bank name from key (format: DATE__BANKNAME)
    const parts = key.split('__');
    if (parts.length < 2) return;
    const bankName = parts.slice(1).join('__'); // handle bank names with __

    // Check if this bank currently exists in the sheet
    const bank = banks.find(b => String(b.d[C.BANK]||'').trim().toUpperCase() === bankName.toUpperCase());
    if (!bank) return; // bank not in sheet — ignore silently

    // Bank is back — has old logs
    restoredBanks.push({ bankName, key, bank, entries, date: parts[0] });
  });

  if (restoredBanks.length) {
    showRestoredBanksPrompt(restoredBanks);
  }
}

function showRestoredBanksPrompt(restoredBanks) {
  // Build a modal dynamically
  const existing = document.getElementById('restored-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'restored-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Previous logs found</div>
          <div class="modal-sub">${restoredBanks.length} bank${restoredBanks.length>1?'s':''} with previous activity have reappeared in your sheet.</div>
        </div>
      </div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--text2);margin-bottom:1rem;line-height:1.6">
          The following banks have logs from a previous session. Choose whether to restore those logs or start fresh for each one.
        </p>
        <div id="restored-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:1rem">
          ${restoredBanks.map((rb,i) => `
            <div style="background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--radius);padding:10px 12px">
              <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(rb.bank.d[C.BANK])}</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${rb.entries.length} log${rb.entries.length>1?'s':''} from ${rb.date.split('-').map((p,i)=>i===0?p:parseInt(p)).join('-')}</div>
              <div style="display:flex;gap:8px">
                <button class="btn-restore" onclick="restoreBankLogs('${rb.key}','${rb.bankName}',${rb.bank.ri},${i})">↩ Restore logs</button>
                <button class="btn-fresh" onclick="startFreshBank('${rb.key}',${i})">✕ Start fresh</button>
              </div>
              <div id="restored-done-${i}" class="hidden" style="font-size:11px;color:var(--green);margin-top:6px"></div>
            </div>
          `).join('')}
        </div>
        <button class="btn-primary" onclick="closeRestoredModal()" style="width:100%">Done</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function restoreBankLogs(oldKey, bankName, ri, idx) {
  // Copy old logs to today's key
  const oldEntries = (logs[oldKey] || []).filter(l => !l.deleted);
  const newKey = workDate + '__' + bankName.toUpperCase();
  if (!logs[newKey]) logs[newKey] = [];

  // Add old entries to today's key with today's date
  oldEntries.forEach(l => {
    const restored = Object.assign({}, l, { date: workDate, restoredFrom: oldKey });
    logs[newKey].push(restored);
  });

  // Mark old entries as deleted so they don't double count
  (logs[oldKey] || []).forEach(l => l.deleted = true);
  saveLogs();

  renderStats();
  const done = document.getElementById('restored-done-' + idx);
  if (done) { done.textContent = '✓ Logs restored'; done.classList.remove('hidden'); }
  toast('Logs restored for ' + bankName, 'success');
}

function startFreshBank(oldKey, idx) {
  // Wipe all logs for this bank
  (logs[oldKey] || []).forEach(l => l.deleted = true);
  saveLogs();
  renderStats();
  const done = document.getElementById('restored-done-' + idx);
  if (done) { done.textContent = '✓ Starting fresh'; done.classList.remove('hidden'); }
  toast('Starting fresh', 'success');
}

function closeRestoredModal() {
  const modal = document.getElementById('restored-modal');
  if (modal) modal.remove();
  renderList(visibleBanks());
}
