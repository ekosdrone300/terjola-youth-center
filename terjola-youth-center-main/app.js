// EmailJS ინიციალიზაცია 
(function() { emailjs.init("sLG1SQZ5c284xvwqS"); })();

// Firebase კონფიგურაცია
const firebaseConfig = {
  apiKey: "AIzaSyCw5vnwCWalEe5AIFcXnsT7-AOnitT3BpI",
  authDomain: "terjola-center.firebaseapp.com",
  projectId: "terjola-center",
  storageBucket: "terjola-center.firebasestorage.app",
  messagingSenderId: "6937368256",
  appId: "1:6937368256:web:4334ccca4db6044a363f25"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 💥 ლოკალური ქეში 💥
let appCache = {
    clubs: null, staff: null, adminStats: null, unifiedList: null, dpoList: null, teacherStudents: null
};

function clearCache(type) {
    if(type === 'students' || type === 'all') { appCache.adminStats = null; appCache.unifiedList = null; appCache.dpoList = null; appCache.teacherStudents = null; }
    if(type === 'clubs' || type === 'all') appCache.clubs = null;
    if(type === 'staff' || type === 'all') appCache.staff = null;
}

let cachedClubs = [], currentClub = "", currentTeacher = "", currentTeacherEmail = "";
let globalAdminData = [], globalDpoData = [];

// AI ჩატი
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  const chatBody = document.getElementById('chatBody');
  chatBody.innerHTML += `<div class="msg user">${msg}</div>`;
  input.value = ''; chatBody.scrollTop = chatBody.scrollHeight;
  document.getElementById('typingIndicator').style.display = 'block';

  try {
      const prompt = `შენი სახელია ეკო. შემქმნელი: ერეკლე კირკიტაძე. თერჯოლის ცენტრის ასისტენტი. მომხმარებელი: ${msg}`;
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyDCSi3_wpTnBwJxYWvJeKiSreAVf8zre-w", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const text = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      chatBody.innerHTML += `<div class="msg bot">${text}</div>`;
  } catch(e) { chatBody.innerHTML += `<div class="msg bot" style="color:red;">კავშირის შეცდომა.</div>`; }
  document.getElementById('typingIndicator').style.display = 'none'; chatBody.scrollTop = chatBody.scrollHeight;
}

// VERCEL / FIREBASE CORE ლოგიკა + EmailJS
async function apiCall(action, data = {}) {
  try {
      if (action === "checkSystemStatus") return { maintenance: false }; 
      
      if (action === "getClubData") {
          const snap = await db.collection("clubs").get();
          let clubs = []; snap.forEach(d => clubs.push([d.id, d.data().limit, d.data().schedule])); return clubs;
      }
      if (action === "registerStudent") {
          let p = data.payload;
          let uId = "TYC-" + new Date().toISOString().slice(2,10).replace(/-/g,"") + "-" + Math.floor(1000+Math.random()*9000);
          
          await db.collection("students").add({
              name: p.name, surname: p.surname, pId: p.personalId || "-", birthDate: p.birthDate, gender: p.gender, school: p.school,
              classNum: p.classNum, gradeLevel: p.gradeLevel, parentName: p.parentName, phone: p.parentPhone, parentEmail: p.parentEmail, clubs: p.clubs, 
              consent: "დადასტურებულია დოკუმენტით", uId: uId, regDate: new Date().toLocaleDateString('en-GB'), timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });

          clearCache('students'); 

          try {
              const teachersSnap = await db.collection("teachers").get();
              let teacherMap = {};
              teachersSnap.forEach(doc => { teacherMap[doc.data().club] = { name: doc.data().name, email: doc.id }; });

              for(let club of p.clubs) {
                  let teacher = teacherMap[club];
                  if(teacher) {
                      let templateParams = {
                          club_name: club, teacher_name: teacher.name, to_email: teacher.email, 
                          student_name: p.name + " " + p.surname, class_num: p.classNum + " (" + p.gradeLevel + ")",
                          parent_name: p.parentName, phone: p.parentPhone
                      };
                      emailjs.send("service_l03ack6", "template_mrmfrvq", templateParams);
                  }
              }
          } catch(e) { console.error("მეილის გაგზავნის შეცდომა:", e); }

          return "success: წარმატებით დარეგისტრირდით!";
      }
      
      if (action === "sysAdminLogin") return { success: data.pass === "system2004" };
      if (action === "addSysClub") { await db.collection("clubs").doc(data.name).set({ limit: data.limit, schedule: data.schedule }); clearCache('clubs'); return "success: კლუბი დაემატა!"; }
      if (action === "deleteSysClub") { await db.collection("clubs").doc(data.name).delete(); clearCache('clubs'); return "success: კლუბი წაიშალა!"; }
      if (action === "getSysStaff") { const snap = await db.collection("teachers").get(); let staff = []; snap.forEach(d => staff.push({ email: d.id, ...d.data() })); return staff; }
      if (action === "addSysStaff") { await db.collection("teachers").doc(data.email).set({ name: data.name, pass: data.pass, club: data.club }); clearCache('staff'); return "success: სტაფი დაემატა!"; }
      if (action === "deleteSysStaff") { await db.collection("teachers").doc(data.email).delete(); clearCache('staff'); return "success: სტაფი წაიშალა!"; }
      if (action === "deleteStudent") { const snap = await db.collection("students").where("uId", "==", data.uId).get(); snap.forEach(doc => doc.ref.delete()); clearCache('students'); return "success: მოსწავლე წაიშალა!"; }
      
      if (action === "teacherLogin") {
          const doc = await db.collection("teachers").doc(data.email).get();
          if (!doc.exists || doc.data().pass !== data.password) return { status: "error" };
          return { status: "success", club: doc.data().club, teacherName: doc.data().name };
      }
      if (action === "changeTeacherPassword") {
          const doc = await db.collection("teachers").doc(data.email).get();
          if (!doc.exists || doc.data().pass !== data.oldPass) return "error: ძველი პაროლი არასწორია!";
          await db.collection("teachers").doc(data.email).update({ pass: data.newPass }); return "success: პაროლი შეიცვალა!";
      }
      if (action === "getStudentsForTeacher") {
          const snap = await db.collection("students").where("clubs", "array-contains", data.clubName).get();
          let list = []; 
          snap.forEach(d => { let st = d.data(); list.push({ ...st, otherClubs: st.clubs.filter(c => c !== data.clubName).join(", ") || "არა", timestamp: st.timestamp }); }); 
          list.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)); return list;
      }
      if (action === "saveAttendance") {
          let batch = db.batch(); data.studentsList.forEach(pid => { let ref = db.collection("attendance").doc(); batch.set(ref, { date: new Date().toISOString(), club: data.club, teacher: data.teacher, pId: pid }); });
          await batch.commit(); return "success: დასწრება შეინახა!";
      }
      
      if (action === "checkAdminPass") return data.pass === "admin2024";
      if (action === "getAdminData") {
          const snap = await db.collection("students").get();
          let stats = { total: snap.size, clubs: {}, genders: { 'მდედრობითი': 0, 'მამრობითი': 0 }, schools: {}, classes: {} };
          snap.forEach(d => {
              let st = d.data();
              if(st.clubs) st.clubs.forEach(c => { stats.clubs[c] = (stats.clubs[c] || 0) + 1; });
              if(st.gender === 'მდ') stats.genders['მდედრობითი']++; else if(st.gender === 'მმ') stats.genders['მამრობითი']++;
              if(st.school) { let sch = st.school.substring(0,25); stats.schools[sch] = (stats.schools[sch] || 0) + 1; }
              if(st.classNum) stats.classes[st.classNum + ' კლასი'] = (stats.classes[st.classNum + ' კლასი'] || 0) + 1;
          }); return stats;
      }
      if (action === "getUnifiedData" || action === "getDpoData") {
          const snap = await db.collection("students").get();
          let list = []; 
          snap.forEach(d => { let st = d.data(); list.push({ ...st, clubsStr: st.clubs.join(", "), docId: d.id, timestamp: st.timestamp }); }); 
          list.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)); return list;
      }
      if (action === "checkDpoPass") return data.pass === "dpo2024";
      
  } catch(e) { console.error(e); return { error: e.message }; }
}

// UI ფუნქციები 
window.onload = async function() {
  if(!appCache.clubs) appCache.clubs = await apiCall("getClubData");
  const data = appCache.clubs;
  let container = document.getElementById("sClubContainer");
  if (data && Array.isArray(data)) {
      cachedClubs = data; 
      // 💥 DOM ოპტიმიზაცია 💥
      container.innerHTML = data.map(row => 
          `<label style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #e2e8f0; cursor:pointer;">
              <input type="checkbox" class="club-checkbox" value="${row[0]}" style="width:20px; height:20px; margin:0;"> 
              <span style="font-weight:bold; font-size:14px; color:#334155;">${row[0]}</span>
          </label>`
      ).join('');
  } else { container.innerHTML = '<div style="color:var(--danger);">კლუბების ბაზა ჯერ ცარიელია.</div>'; }
  document.getElementById('loader-overlay').style.display = 'none';
};

function showSection(id) { document.getElementById('mainMenu').style.display = 'none'; document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); document.getElementById(id).style.display = 'block'; }
function goHome() { document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); document.getElementById('mainMenu').style.display = 'flex'; }
function openSchedule() {
    let modal = document.getElementById('scheduleModal');
    let content = document.getElementById('scheduleContent');
    modal.style.display = 'flex';
    
    if (!cachedClubs || cachedClubs.length === 0) {
        content.innerHTML = '<p style="text-align:center; color:var(--danger); padding:20px; font-weight:bold;">განრიგი ჯერ არ არის დამატებული.</p>';
        return;
    }
    
    let html = '<table class="data-table" style="margin-top:0;"><tr><th>კლუბი</th><th>განრიგი</th></tr>';
    cachedClubs.forEach(c => {
        let scheduleText = c[2] || "არ არის მითითებული";
        html += `<tr><td><b>${c[0]}</b></td><td>${scheduleText}</td></tr>`;
    });
    html += '</table>';
    content.innerHTML = html;
}
function filterTable(id, tableId) { let input = document.getElementById(id).value.toLowerCase(); let tr = document.querySelectorAll(`#${tableId} tr`); tr.forEach((r, i) => { if(i>0) r.style.display = r.innerText.toLowerCase().includes(input) ? "" : "none"; }); }
function acceptTerms() { document.getElementById('termsModal').style.display = 'none'; document.getElementById('checkConsent').checked = true; document.getElementById('consentLabel').style.opacity = '1'; alert("თანხმობა დადასტურებულია"); }
function toggleChat() { let w = document.getElementById('ai-chat-window'); w.style.display = w.style.display === 'none' || w.style.display === '' ? 'flex' : 'none'; }
function handleChatEnter(e) { if(e.key === 'Enter') sendChatMessage(); }
setInterval(() => { document.getElementById('liveClock').innerText = new Date().toLocaleString('ka-GE'); }, 1000);

function getNewBadge(timestamp) {
    if(!timestamp) return "";
    let diffHours = (new Date() - timestamp.toDate()) / (1000 * 60 * 60);
    return diffHours < 24 ? `<span style="background:var(--accent); color:white; padding:3px 6px; border-radius:10px; font-size:10px; margin-left:6px; vertical-align:middle; display:inline-block;"><i class="fas fa-bell"></i> ახალი</span>` : "";
}

async function submitRegistration() {
   let valid = true; ['sName', 'sSurname', 'sSchool', 'sClass', 'sGradeLevel', 'sParentName', 'sParentPhone'].forEach(id => { if(!document.getElementById(id).value) valid = false; });
   let selectedClubs = Array.from(document.querySelectorAll('.club-checkbox:checked')).map(cb => cb.value);
   if(!valid || selectedClubs.length === 0) return alert("შეავსეთ სავალდებულო ველები და მონიშნეთ მინიმუმ 1 კლუბი!");
   if(!document.getElementById('checkInfo').checked || !document.getElementById('checkConsent').checked) return alert("დაეთანხმეთ დოკუმენტს!");
   
   document.getElementById('regBtn').innerText = "იგზავნება...";
   const payloadData = { name: document.getElementById('sName').value, surname: document.getElementById('sSurname').value, personalId: document.getElementById('sPId').value, birthDate: document.getElementById('sBirthDate').value, gender: document.getElementById('sGender').value, school: document.getElementById('sSchool').value, classNum: document.getElementById('sClass').value, gradeLevel: document.getElementById('sGradeLevel').value, parentName: document.getElementById('sParentName').value, parentPhone: document.getElementById('sParentPhone').value, parentEmail: document.getElementById('sParentEmail').value, clubs: selectedClubs };
   const msg = await apiCall("registerStudent", { payload: payloadData });
   alert(msg); if(msg.includes("success")) goHome();
   document.getElementById('regBtn').innerHTML = '<i class="fas fa-paper-plane"></i> დარეგისტრირება';
}

// სისტემური ლოგიკა
async function loginSysAdmin() {
   const isValid = await apiCall("sysAdminLogin", { pass: document.getElementById('sysPass').value });
   if(isValid.success) { document.getElementById('sysLoginForm').style.display = 'none'; document.getElementById('sysContent').style.display = 'block'; switchSysTab('Clubs'); } else alert("პაროლი არასწორია!");
}
function switchSysTab(t) { ['Clubs', 'Staff', 'Students'].forEach(x => { document.getElementById('tabSys'+x).style.display = 'none'; document.getElementById('btnSys'+x).classList.remove('active'); }); document.getElementById('tabSys'+t).style.display = 'block'; document.getElementById('btnSys'+t).classList.add('active'); if(t==='Clubs') loadSysClubs(); if(t==='Staff') loadSysStaff(); if(t==='Students') loadSysStudents(); }

async function loadSysClubs(force = false) { 
    if(force) clearCache('clubs');
    if(!appCache.clubs) appCache.clubs = await apiCall("getClubData");
    const d = appCache.clubs;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysClubs(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>კლუბი</th><th>ლიმიტი</th><th>მოქმედება</th></tr>`; 
    // 💥 DOM ოპტიმიზაცია 💥
    const rows = d.map(c => `<tr><td><b>${c[0]}</b></td><td>${c[1]}</td><td><button class="del-btn" onclick="apiCall('deleteSysClub', {name:'${c[0]}'}).then(()=>loadSysClubs(true))">წაშლა</button></td></tr>`).join('');
    document.getElementById('sysClubsArea').innerHTML = header + rows + "</table>"; 
}
async function addSysClub() { await apiCall("addSysClub", { name: document.getElementById('newClubName').value, limit: document.getElementById('newClubLimit').value, schedule: document.getElementById('newClubSchedule').value }); alert("კლუბი დაემატა!"); loadSysClubs(true); }

async function loadSysStaff(force = false) { 
    if(force) clearCache('staff');
    if(!appCache.staff) appCache.staff = await apiCall("getSysStaff");
    const d = appCache.staff;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysStaff(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>მასწავლებელი</th><th>მეილი / პაროლი</th><th>მიმაგრებული კლუბი</th><th>მოქმედება</th></tr>`; 
    // 💥 DOM ოპტიმიზაცია 💥
    const rows = d.map(t => `<tr><td><b>${t.name}</b></td><td>${t.email}<br><small>პაროლი: ${t.pass}</small></td><td>${t.club}</td><td><button class="del-btn" onclick="apiCall('deleteSysStaff', {email:'${t.email}'}).then(()=>loadSysStaff(true))">წაშლა</button></td></tr>`).join('');
    document.getElementById('sysStaffArea').innerHTML = header + rows + "</table>"; 
}
async function addSysStaff() { 
    const name = document.getElementById('newStaffName').value; const email = document.getElementById('newStaffEmail').value; const pass = document.getElementById('newStaffPass').value; const club = document.getElementById('newStaffClub').value;
    if(!name || !email || !pass || !club) return alert("შეავსეთ ყველა ველი!");
    await apiCall("addSysStaff", { name: name, email: email, pass: pass, club: club }); alert("მასწავლებელი დაემატა!"); loadSysStaff(true); 
}
async function loadSysStudents(force = false) { 
    if(force) clearCache('students');
    if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    const l = appCache.unifiedList;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysStudents(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>მოქმედება</th></tr>`; 
    // 💥 DOM ოპტიმიზაცია 💥
    const rows = l.map(s => `<tr><td>${s.uId}</td><td>${s.surname} ${s.name}</td><td><button class="del-btn" onclick="apiCall('deleteStudent', {uId:'${s.uId}'}).then(()=>loadSysStudents(true))">ბაზიდან წაშლა</button></td></tr>`).join('');
    document.getElementById('sysStudentsArea').innerHTML = header + rows + "</table>"; 
}

// ადმინი და ექსპორტი
async function loginAdmin() { if(await apiCall("checkAdminPass", { pass: document.getElementById('aPass').value })) { document.getElementById('adminLoginForm').style.display = 'none'; document.getElementById('adminContent').style.display = 'block'; switchAdminTab('stats'); } else alert("პაროლი არასწორია!"); }
function switchAdminTab(t) { ['Stats', 'List'].forEach(x => { document.getElementById('tab'+x).style.display = 'none'; document.getElementById('btn'+x).classList.remove('active'); }); document.getElementById('tab'+(t==='stats'?'Stats':'List')).style.display = 'block'; document.getElementById('btn'+(t==='stats'?'Stats':'List')).classList.add('active'); if(t==='stats') loadAdminStats(); else loadUnifiedList(); }

async function loadAdminStats(force = false) { 
    if(force) clearCache('students');
    if(!appCache.adminStats) {
        document.getElementById('adminStatsArea').innerHTML = "<div style='text-align:center; padding:20px;'><div class='spinner' style='margin:0 auto;'></div></div>";
        appCache.adminStats = await apiCall("getAdminData"); 
    }
    const s = appCache.adminStats; 
    let buildTbl = (title, obj) => {
        let rows = Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`).join('');
        return `<div style="flex:1; min-width:220px; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 6px rgba(0,0,0,0.02);"><h4 style="margin-top:0; color:var(--primary); border-bottom:2px solid #e2e8f0; padding-bottom:8px;">${title}</h4><table class="data-table" style="margin-top:0; background:transparent; box-shadow:none;">${rows}</table></div>`;
    };
    let h = `
    <div style="background:linear-gradient(135deg, var(--secondary), #059669); color:white; padding:20px; border-radius:14px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 10px 15px rgba(16,185,129,0.2); flex-wrap:wrap; gap:10px;">
        <h2 style="margin:0; font-size:1.8rem;"><i class="fas fa-users"></i> სულ: ${s.total} მოსწავლე</h2>
        <button onclick="loadAdminStats(true)" class="print-hide" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold;"><i class="fas fa-sync"></i> მონაცემების განახლება</button>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:15px;">
        ${buildTbl('<i class="fas fa-layer-group"></i> კლუბები', s.clubs)}
        ${buildTbl('<i class="fas fa-venus-mars"></i> სქესი', s.genders)}
        ${buildTbl('<i class="fas fa-chalkboard-teacher"></i> კლასები', s.classes)}
        ${buildTbl('<i class="fas fa-school"></i> სკოლები', s.schools)}
    </div>`;
    document.getElementById('adminStatsArea').innerHTML = h; 
}

function downloadAdminCSV() {
    if(!globalAdminData || !globalAdminData.length) return alert("მონაცემები ცარიელია!");
    let csvContent = "\uFEFFსარეგისტრაციო N;გვარი;სახელი;პირადი N;სქესი;დაბადების თარიღი;სკოლა;კლასი;საფეხური;კლუბები;მშობლის სახელი;მშობლის ტელეფონი;რეგისტრაციის თარიღი\n"; 
    globalAdminData.forEach((s) => { 
        let gender = s.gender === 'მდ' ? 'მდედრობითი' : (s.gender === 'მმ' ? 'მამრობითი' : s.gender);
        let row = [s.uId, s.surname, s.name, s.pId, gender, s.birthDate, s.school, s.classNum, s.gradeLevel, s.clubsStr, s.parentName, s.phone, s.regDate].map(v => `"${(v||'').toString().replace(/"/g, '""')}"`).join(';');
        csvContent += row + '\n'; 
    });
    let encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
    let link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "მოსწავლეების_სია.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

async function loginDpo() { if(await apiCall("checkDpoPass", { pass: document.getElementById('dPass').value })) { document.getElementById('dpoLoginForm').style.display = 'none'; document.getElementById('dpoContent').style.display = 'block'; loadDpoData(); } else alert("პაროლი არასწორია!"); }
async function loginTeacher() { const r = await apiCall("teacherLogin", { email: document.getElementById('tEmail').value, password: document.getElementById('tPass').value }); if(r.status==='success'){ currentClub = r.club; currentTeacher = r.teacherName; showSection('teacherDashboard'); document.getElementById('dashTitle').innerText=currentClub; loadStudents(r.club); } else alert("არასწორი მონაცემები!"); }

// 📄 ცხრილები ქეშით და 💥 DOM ოპტიმიზაციით 💥
async function loadStudents(c, force = false) { 
   try {
       if(force) clearCache('students');
       if(!appCache.teacherStudents) appCache.teacherStudents = await apiCall("getStudentsForTeacher", { clubName: c });
       const l = appCache.teacherStudents; 
       
       if (!Array.isArray(l)) { document.getElementById('studentList').innerHTML = '<div style="color:var(--danger); padding:15px; font-weight:bold;">მონაცემები ვერ ჩაიტვირთა.</div>'; return; }
       
       const header = `<div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                  <button class="doc-btn print-hide" onclick="loadStudents('${c}', true)" style="background:#64748b;"><i class="fas fa-sync"></i> განახლება</button>
                  <button onclick="saveAttendance()" class="print-hide" style="background:var(--secondary); padding:10px 18px; border:none; border-radius:12px; color:white; cursor:pointer; font-weight:bold; font-size:13px; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">დასწრების შენახვა</button>
                </div>
                <table class="data-table"><tr><th><i class="fas fa-check"></i></th><th>მოსწავლე</th><th>პირადი N</th><th class="print-hide" style="text-align:center;">განცხადება</th></tr>`; 
                
       const rows = l.map(s => {
           let badge = getNewBadge(s.timestamp);
           let stuData = JSON.stringify({ date: s.regDate || "", name: `${s.name} ${s.surname}`, club: currentClub, school: s.school || "", classNum: s.classNum || "", parentName: s.parentName || "", phone: s.phone || "", uId: s.uId || "" }).replace(/"/g, '&quot;');
           return `<tr>
              <td><input type="checkbox" class="att-check" value="${s.pId}" style="width:18px; height:18px; margin:0; accent-color:var(--secondary);"></td>
              <td><b>${s.surname} ${s.name}</b> ${badge}<br><small style="color:#64748b;">სხვა კლუბები: ${s.otherClubs}</small></td>
              <td>${s.pId}</td>
              <td class="print-hide" style="text-align:center;"><button class="doc-btn" onclick="generateAppDoc('${stuData}')" style="background:var(--primary);"><i class="fas fa-print"></i></button></td>
           </tr>`;
       }).join('');
       
       document.getElementById('studentList').innerHTML = header + rows + "</table>"; 
   } catch(e) { document.getElementById('studentList').innerHTML = '<div style="color:var(--danger); padding:15px; font-weight:bold;">ჩატვირთვის შეცდომა.</div>'; }
}

async function saveAttendance() {
   let ids = Array.from(document.querySelectorAll('.att-check:checked')).map(c => c.value);
   if(!ids.length) return alert("მონიშნეთ მოსწავლეები!");
   const msg = await apiCall("saveAttendance", { club: currentClub, teacher: currentTeacher, studentsList: ids });
   alert(msg); document.querySelectorAll('.att-check').forEach(c=>c.checked=false);
}

async function loadUnifiedList(force = false) { 
    if(force) clearCache('students');
    if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    const l = appCache.unifiedList;
    globalAdminData = l;
    
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadUnifiedList(true)"><i class="fas fa-sync"></i> მონაცემების განახლება</button></div>
             <table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>პირადი N</th><th>კლუბები</th><th class="print-hide" style="text-align:center;">განცხადება</th></tr>`; 
             
    const rows = l.map(s => {
        let badge = getNewBadge(s.timestamp);
        let stuData = JSON.stringify({ date: s.regDate || "", name: `${s.name} ${s.surname}`, club: s.clubsStr, school: s.school || "", classNum: s.classNum || "", parentName: s.parentName || "", phone: s.phone || "", uId: s.uId || "" }).replace(/"/g, '&quot;');
        return `<tr><td>${s.uId}</td><td><b>${s.surname} ${s.name}</b> ${badge}</td><td>${s.pId}</td><td>${s.clubsStr}</td>
              <td class="print-hide" style="text-align:center;"><button class="doc-btn" onclick="generateAppDoc('${stuData}')" style="background:var(--primary);"><i class="fas fa-print"></i></button></td></tr>`;
    }).join('');
    
    document.getElementById('unifiedListArea').innerHTML = header + rows + "</table>"; 
}

async function loadDpoData(force = false) { 
    if(force) clearCache('students');
    if(!appCache.dpoList) {
        document.getElementById('dpoListArea').innerHTML = "<div style='text-align:center; padding:20px;'><div class='spinner' style='margin:0 auto; width:30px; height:30px; border-width:3px;'></div></div>";
        appCache.dpoList = await apiCall("getDpoData");
    }
    const l = appCache.dpoList; 
    globalDpoData = l;
    
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadDpoData(true)"><i class="fas fa-sync"></i> განახლება</button></div>
             <table class="data-table"><tr><th>თარიღი</th><th>გვარი სახელი</th><th>პირადი N</th><th>ტელეფონი</th><th>სტატუსი</th><th class="print-hide" style="text-align:center;">დოკუმენტი</th></tr>`; 
             
    const rows = l.map(s => {
        let badge = getNewBadge(s.timestamp);
        let statusColor = s.consent.includes("დადასტურებულია") ? "var(--secondary)" : "var(--danger)";
        let clubsJoined = s.clubsStr || s.clubs.join(", ");
        let stuData = JSON.stringify({ date: s.regDate, name: `${s.name} ${s.surname}`, pId: s.pId, phone: s.phone, parentName: s.parentName, clubs: clubsJoined, uId: s.uId }).replace(/"/g, '&quot;');
        return `<tr><td>${s.regDate}</td><td><b>${s.surname} ${s.name}</b> ${badge}<br><small style="color:#64748b;">${clubsJoined}</small></td><td>${s.pId}</td><td><a href="tel:${s.phone}" style="text-decoration:none; color:var(--primary); font-weight:500;">${s.phone}</a></td><td style="color:${statusColor}; font-weight:bold;">${s.consent}</td>
              <td class="print-hide" style="text-align:center;"><button class="doc-btn" onclick="generateDpoDoc('${stuData}')"><i class="fas fa-file-pdf"></i></button></td></tr>`;
    }).join('');
    
    document.getElementById('dpoListArea').innerHTML = header + rows + "</table>"; 
}

function generateDpoDoc(dataStr) {
    const s = JSON.parse(dataStr); const docWindow = window.open('', '_blank');
    let dateStr = "___"; let day = "___", month = "___", year = "___";
    if (s.date) { dateStr = s.date.split(',')[0].trim(); let parts = dateStr.split('/'); if (parts.length === 3) { day = parts[0]; month = parts[1]; year = parts[2] ? parts[2].substring(2) : "___"; } }
    const qrData = encodeURIComponent(`თერჯოლის ცენტრი | N: ${s.uId} | მოსწავლე: ${s.name} | თარიღი: ${dateStr}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;

    const htmlContent = `
    <html><head><title>თანხმობის დოკუმენტი - ${s.name}</title>
    <style> @media print { @page { size: A4; margin: 12mm; } } body { font-family: 'Sylfaen', serif; padding: 0; max-width: 800px; margin: auto; line-height: 1.35; color: #000; font-size: 13px;} p { margin-bottom: 10px; text-align: left; margin-top: 0; } .reg-id { text-align: right; font-size: 12px; font-family: sans-serif; color: #000; font-weight: bold; } .header-text { text-align: center; font-size: 13px; margin-bottom: 20px; font-weight: bold; } .title { text-align: left; font-weight: bold; margin-bottom: 15px; font-size: 14px;} .blank-line { display: inline-block; min-width: 300px; border-bottom: 1px solid #000; text-align: center; padding: 0 10px; font-weight: bold; } .small-label { display: block; font-size: 11px; margin-left: 145px; color: #333; margin-bottom: 15px;} .child-data-box { border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 15px 0; padding: 10px 0; text-align: center; font-weight: bold; font-size: 14px; } .list-section { text-align: left; margin-bottom: 15px; } .list-section ul { margin: 5px 0; padding-left: 20px; } .list-section li { margin-bottom: 4px; } .sig-line { display: inline-block; font-weight: bold; font-size: 15px; color: #000; } .date-blank { text-decoration: none; border-bottom: 1px solid #000; padding: 0 8px; } </style>
    </head><body><div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;"><img src="${qrUrl}" style="width: 80px; height: 80px;" alt="QR Code"><div class="reg-id">სარეგისტრაციო N: ${s.uId}</div></div>
      <div class="header-text">ა(ა)იპ სკოლისგარეშე სააღმზრდელო დაწესებულება თერჯოლის მოსწავლე-ახალგაზრდობის სოციალური დაცვის მოქალაქეობრივი და ესთეტიკური აღზრდის მუნიციპალური ცენტრი</div>
      <div class="title">თანხმობა ბავშვის პერსონალური მონაცემების დამუშავებაზე</div>
      <div><b>მე, ქვევით ხელმომწერი</b> <span class="blank-line">${s.parentName}</span></div><div class="small-label">(მშობლის/კანონიერი წარმომადგენლის სახელი, გვარი)</div>
      <p>ვაცხადებ თანხმობას, რომ ა(ა)იპ სკოლისგარეშე სააღმზრდელო დაწესებულება, თერჯოლის მოსწავლე-ახალგაზრდობის სოციალური დაცვის, მოქალაქეობრივი და ესთეტიკური აღზრდის მუნიციპალურმა ცენტრმა დაამუშავოს ჩემი შვილის (ების) მზრუნველობაში მყოფი ბავშვის (ების)</p>
      <div class="child-data-box">${s.name}, პირადი N: ${s.pId}, წრეები: ${s.clubs}</div>
      <div class="list-section"><b>შემდეგი პერსონალური მონაცემები:</b><ul><li>სახელი, გვარი;</li><li>პირადი ნომერი;</li><li>სკოლა, კლასი;</li><li>საცხოვრებელი მისამართი და საკონტაქტო ინფორმაცია;</li><li>სასწავლო ჯგუფის, წრის ან კლუბის შესახებ ინფორმაცია;</li><li>გასვლით სასწავლო - შემოქმედებით საქმიანობაში მონაწილეობა.</li><li>ფოტო და ვიდეომასალა, რომელიც გამოიყენება მხოლოდ დაწესებულების საქმიანობის პოპულარიზაციისა და ღონისძიებებში მონაწილეობის ასახვის მიზნით.</li></ul></div>
      <div class="list-section"><b>მონაცემების დამუშავების მიზანია:</b><br>ბავშვის სასწავლო და შემოქმედებით პროცესში ჩართვა, აღრიცხვა, უსაფრთხოების უზრუნველყოფა და ა(ა)იპ-ის საქმიანობასთან დაკავშირებული ინფორმაციის მართვა. პერსონალური მონაცემების დამუშავება განხორციელდება საქართველოს პერსონალურ მონაცემთა დაცვის კანონმდებლობის სრული დაცვით. მე ინფორმირებული ვარ, რომ მაქვს უფლება ნებისმიერ დროს მოვითხოვო მონაცემების განახლება, შესწორება ან მათი წაშლა, აგრეთვე თანხმობის გაუქმება.</div>
      <p style="margin-top: 10px; margin-bottom: 20px;">პერსონალურ მონაცემთა დამუშავებაზე პასუხისმგებელი პირი - ა(ა)იპ სკოლისგარეშე სააღმზრდელო დაწესებულება თერჯოლის მოსწავლე-ახალგაზრდობის სოციალური დაცვის მოქალაქეობრივი და ესთეტიკური აღზრდის მუნიციპალური ცენტრის პერსონალურ მონაცემთა დაცვის ოფიცერი ნათელა ქუთათელაძე. ტელ: 591 239413</p>
      <div style="margin-bottom: 15px;">თარიღი: &nbsp;<u class="date-blank">${day}</u> / <u class="date-blank">${month}</u> / 20<u class="date-blank">${year}</u> წ.</div>
      <div>მშობლის/კანონიერი წარმომადგენლის ხელმოწერა: &nbsp;<span class="sig-line">${s.parentName}</span></div>
     </div><script>setTimeout(() => { window.print(); }, 800);<\/script></body></html>`;
    docWindow.document.write(htmlContent); docWindow.document.close();
}

function generateAppDoc(dataStr) {
    const s = JSON.parse(dataStr); const docWindow = window.open('', '_blank');
    let day = "___", month = "___", year = "___"; let dateStr = "___";
    if (s.date) { dateStr = s.date.split(',')[0].trim(); let parts = dateStr.split('/'); if (parts.length === 3) { day = parts[0]; month = parts[1]; year = parts[2] ? parts[2].substring(2) : "___"; } }
    const qrData = encodeURIComponent(`თერჯოლის ცენტრი | განცხადება\nN: ${s.uId}\nმოსწავლე: ${s.name}\nთარიღი: ${dateStr}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;

    const htmlContent = `
    <html><head><title>განცხადება - ${s.name}</title>
    <style> @media print { @page { size: A4; margin: 20mm; } } body { font-family: 'Sylfaen', serif; padding: 0; max-width: 800px; margin: auto; line-height: 1.6; color: #000; font-size: 15px;} .doc-wrapper { padding: 10px; } .reg-id { text-align: right; font-size: 13px; font-family: sans-serif; color: #000; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; } .clearfix::after { content: ""; clear: both; display: table; } .header-right { text-align: right; margin-left: auto; width: 60%; font-size: 14px; margin-bottom: 50px; line-height: 1.5; margin-top: 20px;} .title { text-align: center; font-weight: bold; font-size: 22px; letter-spacing: 8px; margin: 40px 0 50px 0;} .body-text { text-align: justify; line-height: 2.2; font-size: 15px; } .blank-line { display: inline-block; border-bottom: 1px dashed #000; text-align: center; padding: 0 10px; font-weight: bold; color: #000; text-decoration: none; min-width: 50px;} .footer-right { text-align: left; margin-left: 60%; margin-top: 70px; line-height: 2.2; font-size: 15px;} .sig-line { display: inline-block; font-weight: bold; font-size: 15px; color: #000; } </style>
    </head><body><div class="doc-wrapper clearfix">
      <img src="${qrUrl}" style="float: left; width: 85px; height: 85px;" alt="QR Code"><div class="reg-id" style="float: right;">სარეგისტრაციო N: ${s.uId || "__________"}</div><div style="clear:both;"></div>
      <div class="header-right">ა (ა) იპ თერჯოლის მოსწავლე-ახალგაზრდობის<br>სოციალური დაცვის, მოქალაქეობრივი და ესთეტიკური<br>აღზრდის მუნიციპალური ცენტრის დირექტორს<br>ქალბატონ ნათია მოსიაშვილს<br><div style="font-size: 12px; margin-top: 5px;">(მშობლის სახელი, გვარი)</div><div class="blank-line" style="min-width: 250px; text-align: right; margin-top: 5px;">${s.parentName}</div></div>
      <div class="title">გ ა ნ ც ხ ა დ ე ბ ა</div>
      <div class="body-text">სურვილი მაქვს ჩაირიცხოს ჩემი შვილი <span class="blank-line" style="min-width: 300px;">${s.name}</span><br>კლუბი (წრე) <span class="blank-line" style="min-width: 200px;">${s.club}</span> სკოლა <span class="blank-line" style="min-width: 150px;">${s.school}</span> კლასი <span class="blank-line" style="min-width: 50px;">${s.classNum}</span></div>
      <div class="footer-right">თარიღი: <span class="blank-line" style="min-width: 150px;">${day} / ${month} / 20${year} წ.</span><br>ხელმოწერა: <span class="blank-line" style="min-width: 150px;"><span class="sig-line">${s.parentName}</span></span><br>საკონტაქტო: <span class="blank-line" style="min-width: 150px;">${s.phone}</span></div>
     </div><script>setTimeout(() => { window.print(); }, 800);<\/script></body></html>`;
    docWindow.document.write(htmlContent); docWindow.document.close();
}