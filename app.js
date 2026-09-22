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
const messaging = firebase.messaging(); // FCM ინიციალიზაცია

// 💥 წინა პლანზე (საიტზე ყოფნისას) მოსული მესიჯის დამუშავება
messaging.onMessage((payload) => {
  console.log('მიღებული მესიჯი ეკრანზე:', payload);
  
  // გამოვიტანოთ ჩვენივე Toast ფანჯარაში
  showToast(`🔔 ${payload.notification.title} - ${payload.notification.body}`, "success");
  
  // სისტემური ფანჯრის ამოგდება
  if (Notification.permission === 'granted') {
      new Notification(payload.notification.title, {
          body: payload.notification.body,
          icon: '/logo.png'
      });
  }
});

// ლოკალური ქეში + System Status
let appCache = {
    clubs: null, staff: null, adminStats: null, unifiedList: null, dpoList: null, teacherStudents: null, sysStatus: {}
};

function clearCache(type) {
    if(type === 'students' || type === 'all') { appCache.adminStats = null; appCache.unifiedList = null; appCache.dpoList = null; appCache.teacherStudents = null; }
    if(type === 'clubs' || type === 'all') appCache.clubs = null;
    if(type === 'staff' || type === 'all') appCache.staff = null;
}

let cachedClubs = [], currentClub = "", currentTeacher = "", currentTeacherEmail = "";
let globalAdminData = [], globalDpoData = [];

// Toast ფუნქცია
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
}

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
      const prompt = `შენი სახელია ეკო. ტექნოლოგია: LuminAI (ჩვენს მიერ შექმნილი). შემქმნელი: ერეკლე კირკიტაძე. თერჯოლის ცენტრის ასისტენტი. მომხმარებელი: ${msg}`;
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

// VERCEL / FIREBASE CORE ლოგიკა + EmailJS + Push
async function apiCall(action, data = {}) {
  try {
      if (action === "checkSystemStatus") return { maintenance: false }; 
      
      if (action === "getClubData") {
          const snap = await db.collection("clubs").get();
          let clubs = []; 
          snap.forEach(d => {
              if(d.id !== "system_status") { clubs.push([d.id, d.data().limit, d.data().schedule]); }
          }); 
          return clubs;
      }
      
      if (action === "registerStudent") {
          let p = data.payload;
          let uId = "TYC-" + new Date().toISOString().slice(2,10).replace(/-/g,"") + "-" + Math.floor(1000+Math.random()*9000);
          
          let finalRegDate = p.customRegDate ? p.customRegDate : new Date().toLocaleDateString('en-GB');
          let finalConsent = p.isSpecial ? "ძველი DPO (გაციფრებული)" : "დადასტურებულია დოკუმენტით";
          
          await db.collection("students").add({
              name: p.name, surname: p.surname, pId: p.personalId || "-", birthDate: p.birthDate || "-", gender: p.gender || "-", school: p.school,
              classNum: p.classNum, gradeLevel: p.gradeLevel || "-", parentName: p.parentName, phone: p.parentPhone, parentEmail: p.parentEmail || "-", clubs: p.clubs, 
              consent: finalConsent, uId: uId, regDate: finalRegDate, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              isOldStudent: p.isSpecial ? true : false,
              appType: p.appType || "parent"
          });

          clearCache('students'); 

          // მეილების და პუშების გაგზავნა მხოლოდ ახალ (არაგაციფრულებულ) რეგისტრაციებზე
          if (!p.isSpecial) {
              // 1. მეილების გაგზავნა EmailJS-ით
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

              // 2. პუშ შეტყობინებების გაგზავნა Vercel-ის სერვერული ფუნქციის გავლით
              try {
                  await fetch('/api/sendPush', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: p.name, surname: p.surname, clubs: p.clubs })
                  });
              } catch(e) { console.error("პუშის გაგზავნის შეცდომა:", e); }
          }

          return "success: წარმატებით დარეგისტრირდით!";
      }
      
      if (action === "sysAdminLogin") return { success: data.pass === "system2004" };
      if (action === "addSysClub") { await db.collection("clubs").doc(data.name).set({ limit: data.limit, schedule: data.schedule }); clearCache('clubs'); return "success: კლუბი დაემატა!"; }
      if (action === "deleteSysClub") { await db.collection("clubs").doc(data.name).delete(); clearCache('clubs'); return "success: კლუბი წაიშალა!"; }
      if (action === "getSysStaff") { const snap = await db.collection("teachers").get(); let staff = []; snap.forEach(d => staff.push({ email: d.id, ...d.data() })); return staff; }
      if (action === "addSysStaff") { await db.collection("teachers").doc(data.email).set({ name: data.name, pass: data.pass, club: data.club }); clearCache('staff'); return "success: სტაფი დაემატა!"; }
      if (action === "deleteSysStaff") { await db.collection("teachers").doc(data.email).delete(); clearCache('staff'); return "success: სტაფი წაიშალა!"; }
      if (action === "deleteStudent") { const snap = await db.collection("students").where("uId", "==", data.uId).get(); snap.forEach(doc => doc.ref.delete()); clearCache('students'); return "success: მოსწავლე წაიშალა!"; }
      
      if (action === "requestDeleteStudent") {
          await db.collection("students").doc(data.docId).update({ 
              deleteRequest: true, deleteRequestedBy: data.teacher, deleteRequestedClub: data.club 
          });
          clearCache('students'); return "success: წაშლის მოთხოვნა გაიგზავნა ადმინისტრატორთან!";
      }
      
      if (action === "rejectDelete") {
          await db.collection("students").doc(data.docId).update({ 
              deleteRequest: firebase.firestore.FieldValue.delete(), deleteRequestedBy: firebase.firestore.FieldValue.delete(), deleteRequestedClub: firebase.firestore.FieldValue.delete() 
          });
          clearCache('students'); return "success";
      }

      if (action === "deleteStudentByDoc") {
          await db.collection("students").doc(data.docId).delete(); clearCache('students'); return "success";
      }

      if (action === "markOldStudent") {
          await db.collection("students").doc(data.docId).update({ isOldStudent: data.isOld }); clearCache('students'); return "success";
      }

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
          snap.forEach(d => { let st = d.data(); list.push({ ...st, docId: d.id, isOldStudent: st.isOldStudent || false, deleteRequest: st.deleteRequest || false, otherClubs: st.clubs.filter(c => c !== data.clubName).join(", ") || "არა", timestamp: st.timestamp }); }); 
          list.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)); return list;
      }
      if (action === "saveAttendance") {
          let batch = db.batch(); data.studentsList.forEach(pid => { let ref = db.collection("attendance").doc(); batch.set(ref, { date: new Date().toISOString(), club: data.club, teacher: data.teacher, pId: pid }); });
          await batch.commit(); return "success: დასწრება შეინახა!";
      }
      
      if (action === "checkAdminPass") return data.pass === "admin2024";
      if (action === "getAdminData") {
          const snap = await db.collection("students").get();
          let stats = { total: snap.size, oldStudents: 0, newStudents: 0, clubs: {}, genders: { 'მდედრობითი': 0, 'მამრობითი': 0 }, schools: {}, classes: {} };
          snap.forEach(d => {
              let st = d.data();
              if(st.isOldStudent) stats.oldStudents++; else stats.newStudents++;
              if(st.clubs) st.clubs.forEach(c => { stats.clubs[c] = (stats.clubs[c] || 0) + 1; });
              if(st.gender === 'მდ') stats.genders['მდედრობითი']++; else if(st.gender === 'მმ') stats.genders['მამრობითი']++;
              if(st.school) { let sch = st.school.substring(0,25); stats.schools[sch] = (stats.schools[sch] || 0) + 1; }
              if(st.classNum) stats.classes[st.classNum + ' კლასი'] = (stats.classes[st.classNum + ' კლასი'] || 0) + 1;
          }); return stats;
      }
      if (action === "getUnifiedData" || action === "getDpoData") {
          const snap = await db.collection("students").get();
          let list = []; 
          snap.forEach(d => { let st = d.data(); list.push({ ...st, isOldStudent: st.isOldStudent || false, deleteRequest: st.deleteRequest || false, deleteRequestedBy: st.deleteRequestedBy || "", deleteRequestedClub: st.deleteRequestedClub || "", clubsStr: st.clubs.join(", "), docId: d.id, timestamp: st.timestamp }); }); 
          list.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)); return list;
      }
      if (action === "checkDpoPass") return data.pass === "12345";
      
  } catch(e) { console.error(e); return { error: e.message }; }
}

// UI ფუნქციები და Real-time Status
window.onload = async function() {
  db.collection("clubs").doc("system_status").onSnapshot(doc => {
      appCache.sysStatus = doc.exists ? doc.data() : {};
      
      let chkReg = document.getElementById('chkReg');
      if(chkReg) {
          chkReg.checked = appCache.sysStatus.regDisabled || false;
          document.getElementById('chkTeacher').checked = appCache.sysStatus.teacherDisabled || false;
          document.getElementById('chkAdmin').checked = appCache.sysStatus.adminDisabled || false;
          document.getElementById('chkDpo').checked = appCache.sysStatus.dpoDisabled || false;
      }
  });

  if(!appCache.clubs) appCache.clubs = await apiCall("getClubData");
  const data = appCache.clubs;
  let container = document.getElementById("sClubContainer");
  if (data && Array.isArray(data)) {
      cachedClubs = data; 
      container.innerHTML = data.map(row => 
          `<label style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #e2e8f0; cursor:pointer;">
              <input type="checkbox" class="club-checkbox" value="${row[0]}" style="width:20px; height:20px; margin:0;"> 
              <span style="font-weight:bold; font-size:14px; color:#334155;">${row[0]}</span>
          </label>`
      ).join('');
  } else { container.innerHTML = '<div style="color:var(--danger);">კლუბების ბაზა ჯერ ცარიელია.</div>'; }
  document.getElementById('loader-overlay').style.display = 'none';
};

// 💥 FCM შეტყობინებების გამოწერა კონფლიქტის გარეშე
async function subscribeToNotifications() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // მივუთითოთ პირდაპირ Firebase-ის Service Worker-ზე
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            
            const currentToken = await messaging.getToken({ 
                vapidKey: 'BJyLCIV9109r2E6Q7eHJmipJr262hfltBZDX8t16vcyd5j9zuy9Bw6VXuc_8pUE_NOMxOK8pPtJzEfGQFNSmPTM',
                serviceWorkerRegistration: registration 
            });
            
            if (currentToken) {
                await db.collection('fcmTokens').doc(currentToken).set({
                    token: currentToken,
                    userType: currentTeacher ? `Teacher - ${currentTeacher}` : "Admin",
                    club: currentClub || "Admin",
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast("შეტყობინებები წარმატებით გამოიწერეთ!", "success");
            } else {
                showToast("ტოკენის მიღება ვერ მოხერხდა", "error");
            }
        } else {
            showToast("თქვენ დაბლოკეთ შეტყობინებები ბრაუზერში.", "warning");
        }
    } catch(err) {
        console.error("შეცდომა გამოწერისას: ", err);
        showToast("შეცდომა გამოწერისას (ნახეთ Console)", "error");
    }
}

// სპეციალური რეგისტრაციის ლოგიკა (გაციფრულება)
function toggleSpParentFields() {
    let isStudent = document.querySelector('input[name="spAppType"]:checked').value === 'student';
    document.getElementById('spParentSection').style.display = isStudent ? 'none' : 'block';
}

function openSpecialReg() {
    document.getElementById('spRegModal').style.display = 'flex';
    let container = document.getElementById("spClubContainer");
    if (cachedClubs && cachedClubs.length > 0) {
        container.innerHTML = cachedClubs.map(row => 
            `<label style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0; cursor:pointer;">
                <input type="checkbox" class="sp-club-checkbox" value="${row[0]}" style="width:18px; height:18px; margin:0;" ${row[0] === currentClub ? 'checked' : ''}> 
                <span style="font-weight:bold; font-size:14px; color:#334155;">${row[0]}</span>
            </label>`
        ).join('');
    }
}

async function submitSpRegistration() {
   let appType = document.querySelector('input[name="spAppType"]:checked').value;
   let valid = true; 
   let reqFields = ['spDate', 'spName', 'spSurname', 'spSchool', 'spClass', 'spPhone'];
   if(appType === 'parent') reqFields.push('spParentName', 'spParentSurname');
   reqFields.forEach(id => { if(!document.getElementById(id).value) valid = false; });
   
   let selectedClubs = Array.from(document.querySelectorAll('.sp-club-checkbox:checked')).map(cb => cb.value);
   if(!valid || selectedClubs.length === 0) return showToast("შეავსეთ სავალდებულო ველები და მონიშნეთ მინიმუმ 1 კლუბი!", "error");

   let dParts = document.getElementById('spDate').value.split('-');
   let customDateStr = `${dParts[2]}/${dParts[1]}/${dParts[0]}`; 
   
   let pName = appType === 'parent' ? document.getElementById('spParentName').value.trim() : "-";
   let pSurname = appType === 'parent' ? document.getElementById('spParentSurname').value.trim() : "";
   
   document.getElementById('spRegBtn').innerText = "ინახება...";
   
   const payloadData = { 
       name: document.getElementById('spName').value, 
       surname: document.getElementById('spSurname').value, 
       personalId: document.getElementById('spPId').value || "-", 
       school: document.getElementById('spSchool').value, 
       classNum: document.getElementById('spClass').value, 
       parentName: pName + (pSurname ? " " + pSurname : ""), 
       parentPhone: document.getElementById('spPhone').value, 
       clubs: selectedClubs,
       customRegDate: customDateStr,
       appType: appType,
       isSpecial: true
   };
   
   const msg = await apiCall("registerStudent", { payload: payloadData });
   if(msg.includes("success")) { 
       showToast("მონაცემები წარმატებით გაციფრულდა!", "success"); 
       document.getElementById('spRegModal').style.display = 'none';
       ['spDate','spName','spSurname','spPId','spSchool','spClass','spParentName','spParentSurname','spPhone'].forEach(id => document.getElementById(id).value='');
       loadStudents(currentClub, true); 
   } else { 
       showToast(msg, "error"); 
   }
   document.getElementById('spRegBtn').innerHTML = '<i class="fas fa-save"></i> სისტემაში დამატება';
}

function showSection(id) { 
    if (id === 'studentReg' && appCache.sysStatus.regDisabled) return showToast("რეგისტრაცია დროებით შეჩერებულია ტექნიკური სამუშაოების გამო.", "warning");
    if (id === 'teacherLogin' && appCache.sysStatus.teacherDisabled) return showToast("მასწავლებლის პანელი დროებით გათიშულია.", "warning");
    if (id === 'adminPanel' && appCache.sysStatus.adminDisabled) return showToast("ადმინის პანელი დროებით გათიშულია.", "warning");
    if (id === 'dpoPanel' && appCache.sysStatus.dpoDisabled) return showToast("DPO პანელი დროებით გათიშულია.", "warning");

    document.getElementById('mainMenu').style.display = 'none'; 
    document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); 
    document.getElementById(id).style.display = 'block'; 
}

function goHome() { document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); document.getElementById('mainMenu').style.display = 'flex'; }

function openSchedule() {
    let modal = document.getElementById('scheduleModal');
    let content = document.getElementById('scheduleContent');
    modal.style.display = 'flex';
    if (!cachedClubs || cachedClubs.length === 0) { content.innerHTML = '<p style="text-align:center; color:var(--danger); padding:20px; font-weight:bold;">განრიგი ჯერ არ არის დამატებული.</p>'; return; }
    let html = '<table class="data-table" style="margin-top:0;"><tr><th>კლუბი</th><th>განრიგი</th></tr>';
    cachedClubs.forEach(c => { html += `<tr><td><b>${c[0]}</b></td><td>${c[2] || "არ არის მითითებული"}</td></tr>`; });
    content.innerHTML = html + '</table>';
}

function filterTable(id, tableId) { let input = document.getElementById(id).value.toLowerCase(); let tr = document.querySelectorAll(`#${tableId} tr`); tr.forEach((r, i) => { if(i>0) r.style.display = r.innerText.toLowerCase().includes(input) ? "" : "none"; }); }

function acceptTerms() { 
    document.getElementById('termsModal').style.display = 'none'; 
    document.getElementById('checkConsent').checked = true; 
    document.getElementById('consentLabel').style.opacity = '1'; 
    showToast("თანხმობა დადასტურებულია", "success"); 
}

function toggleChat() { let w = document.getElementById('ai-chat-window'); w.style.display = w.style.display === 'none' || w.style.display === '' ? 'flex' : 'none'; }
function handleChatEnter(e) { if(e.key === 'Enter') sendChatMessage(); }
setInterval(() => { document.getElementById('liveClock').innerText = new Date().toLocaleString('ka-GE'); }, 1000);

function getNewBadge(timestamp) {
    if(!timestamp) return "";
    let diffHours = (new Date() - timestamp.toDate()) / (1000 * 60 * 60);
    return diffHours < 24 ? `<span style="background:var(--accent); color:white; padding:3px 6px; border-radius:10px; font-size:10px; margin-left:6px; vertical-align:middle; display:inline-block;"><i class="fas fa-bell"></i> ახალი</span>` : "";
}

window.toggleOldStudent = async function(docId, cb) {
    let isOld = cb.checked; cb.disabled = true;
    try {
        await apiCall("markOldStudent", { docId: docId, isOld: isOld });
        if(appCache.teacherStudents) { let st = appCache.teacherStudents.find(x => x.docId === docId); if(st) st.isOldStudent = isOld; }
        if(appCache.unifiedList) { let st = appCache.unifiedList.find(x => x.docId === docId); if(st) st.isOldStudent = isOld; }
        if(appCache.dpoList) { let st = appCache.dpoList.find(x => x.docId === docId); if(st) st.isOldStudent = isOld; }
        loadStudents(currentClub, false); showToast("სტატუსი განახლდა", "success");
    } catch(e) { showToast("შეცდომა სტატუსის განახლებისას", "error"); cb.checked = !isOld; }
    cb.disabled = false;
}

window.requestDelete = async function(docId) {
    if(!confirm("ნამდვილად გსურთ ადმინისტრატორთან წაშლის მოთხოვნის გაგზავნა?")) return;
    let msg = await apiCall("requestDeleteStudent", { docId: docId, teacher: currentTeacher, club: currentClub });
    if(msg.includes("success")) showToast("წაშლის მოთხოვნა გაიგზავნა!", "success");
    loadStudents(currentClub, true);
}

window.approveDelete = async function(docId) {
    if(!confirm("ნამდვილად ადასტურებთ მოსწავლის საბოლოოდ წაშლას ბაზიდან? ეს ქმედება შეუქცევადია!")) return;
    await apiCall("deleteStudentByDoc", { docId: docId });
    showToast("მოსწავლე წარმატებით წაიშალა.", "success");
    loadUnifiedList(true); loadAdminStats(true);
}

window.rejectDelete = async function(docId) {
    if(!confirm("ნამდვილად გსურთ წაშლის მოთხოვნის უარყოფა?")) return;
    await apiCall("rejectDelete", { docId: docId });
    showToast("წაშლის მოთხოვნა გაუქმებულია.", "info"); loadUnifiedList(true);
}

async function submitRegistration() {
   let valid = true; ['sName', 'sSurname', 'sSchool', 'sClass', 'sGradeLevel', 'sParentName', 'sParentSurname', 'sParentPhone'].forEach(id => { if(!document.getElementById(id).value) valid = false; });
   let selectedClubs = Array.from(document.querySelectorAll('.club-checkbox:checked')).map(cb => cb.value);
   
   if(!valid || selectedClubs.length === 0) return showToast("შეავსეთ სავალდებულო ველები და მონიშნეთ მინიმუმ 1 კლუბი!", "error");
   if(!document.getElementById('checkInfo').checked || !document.getElementById('checkConsent').checked) return showToast("გთხოვთ, დაეთანხმოთ დოკუმენტს!", "warning");
   
   let classLevel = parseInt(document.getElementById('sClass').value);
   let isRoboticsSelected = selectedClubs.some(club => club.includes("რობოტექნიკა") || club.includes("რობოტიკა"));
   
   if (isRoboticsSelected && classLevel < 6) {
       return showToast("რობოტექნიკის პროგრამა გათვლილია მხოლოდ მე-6 და უფრო მაღალი კლასის მოსწავლეებზე. გთხოვთ, გადაამოწმოთ არჩეული კლასი ან შეცვალოთ კლუბი.", "warning");
   }
   
   document.getElementById('regBtn').innerText = "იგზავნება...";
   let pName = document.getElementById('sParentName').value.trim();
   let pSurname = document.getElementById('sParentSurname').value.trim();
   
   const payloadData = { 
       name: document.getElementById('sName').value, surname: document.getElementById('sSurname').value, personalId: document.getElementById('sPId').value, birthDate: document.getElementById('sBirthDate').value, gender: document.getElementById('sGender').value, school: document.getElementById('sSchool').value, classNum: document.getElementById('sClass').value, gradeLevel: document.getElementById('sGradeLevel').value, parentName: pName + " " + pSurname, parentPhone: document.getElementById('sParentPhone').value, parentEmail: document.getElementById('sParentEmail').value, clubs: selectedClubs 
   };
   
   const msg = await apiCall("registerStudent", { payload: payloadData });
   if(msg.includes("success")) { showToast("წარმატებით დარეგისტრირდით!", "success"); goHome(); } else { showToast(msg, "error"); }
   document.getElementById('regBtn').innerHTML = '<i class="fas fa-paper-plane"></i> დარეგისტრირება';
}

async function loginSysAdmin() {
   const isValid = await apiCall("sysAdminLogin", { pass: document.getElementById('sysPass').value });
   if(isValid.success) { document.getElementById('sysLoginForm').style.display = 'none'; document.getElementById('sysContent').style.display = 'block'; switchSysTab('Clubs'); showToast("ავტორიზაცია წარმატებულია!", "success"); } else showToast("პაროლი არასწორია!", "error");
}

window.toggleSysStatus = async function(field, val) {
    try {
        await db.collection("clubs").doc("system_status").set({ [field]: val }, { merge: true });
        showToast("ტექნიკური რეჟიმი შეიცვალა", "success");
    } catch(e) { 
        console.error(e);
        showToast("შეცდომა რეჟიმის შეცვლისას", "error"); 
    }
}

function switchSysTab(t) { 
    ['Clubs', 'Staff', 'Students', 'Settings'].forEach(x => { 
        let tab = document.getElementById('tabSys'+x); let btn = document.getElementById('btnSys'+x);
        if(tab) tab.style.display = 'none'; if(btn) btn.classList.remove('active'); 
    }); 
    document.getElementById('tabSys'+t).style.display = 'block'; 
    document.getElementById('btnSys'+t).classList.add('active'); 
    if(t==='Clubs') loadSysClubs(); if(t==='Staff') loadSysStaff(); if(t==='Students') loadSysStudents(); 
}

async function loadSysClubs(force = false) { 
    if(force) clearCache('clubs');
    if(!appCache.clubs) appCache.clubs = await apiCall("getClubData");
    const d = appCache.clubs;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysClubs(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>კლუბი</th><th>ლიმიტი</th><th>მოქმედება</th></tr>`; 
    const rows = d.map(c => `<tr><td><b>${c[0]}</b></td><td>${c[1]}</td><td><button class="del-btn" onclick="apiCall('deleteSysClub', {name:'${c[0]}'}).then(()=>{ showToast('კლუბი წაიშალა', 'info'); loadSysClubs(true); })">წაშლა</button></td></tr>`).join('');
    document.getElementById('sysClubsArea').innerHTML = header + rows + "</table>"; 
}
async function addSysClub() { await apiCall("addSysClub", { name: document.getElementById('newClubName').value, limit: document.getElementById('newClubLimit').value, schedule: document.getElementById('newClubSchedule').value }); showToast("კლუბი დაემატა!", "success"); loadSysClubs(true); }

async function loadSysStaff(force = false) { 
    if(force) clearCache('staff');
    if(!appCache.staff) appCache.staff = await apiCall("getSysStaff");
    const d = appCache.staff;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysStaff(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>მასწავლებელი</th><th>მეილი / პაროლი</th><th>მიმაგრებული კლუბი</th><th>მოქმედება</th></tr>`; 
    const rows = d.map(t => `<tr><td><b>${t.name}</b></td><td>${t.email}<br><small>პაროლი: ${t.pass}</small></td><td>${t.club}</td><td><button class="del-btn" onclick="apiCall('deleteSysStaff', {email:'${t.email}'}).then(()=>{ showToast('სტაფი წაიშალა', 'info'); loadSysStaff(true); })">წაშლა</button></td></tr>`).join('');
    document.getElementById('sysStaffArea').innerHTML = header + rows + "</table>"; 
}
async function addSysStaff() { 
    const name = document.getElementById('newStaffName').value; const email = document.getElementById('newStaffEmail').value; const pass = document.getElementById('newStaffPass').value; const club = document.getElementById('newStaffClub').value;
    if(!name || !email || !pass || !club) return showToast("შეავსეთ ყველა ველი!", "warning");
    await apiCall("addSysStaff", { name: name, email: email, pass: pass, club: club }); showToast("მასწავლებელი დაემატა!", "success"); loadSysStaff(true); 
}
async function loadSysStudents(force = false) { 
    if(force) clearCache('students');
    if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    const l = appCache.unifiedList;
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadSysStudents(true)"><i class="fas fa-sync"></i> განახლება</button></div><table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>მოქმედება</th></tr>`; 
    const rows = l.map(s => {
        let oldBadge = s.isOldStudent ? `<span class="old-badge"><i class="fas fa-history"></i> ძველი</span>` : '';
        return `<tr><td>${s.uId}</td><td>${s.surname} ${s.name} ${oldBadge}</td><td><button class="del-btn" onclick="if(confirm('ნამდვილად გსურთ წაშლა?')){ apiCall('deleteStudent', {uId:'${s.uId}'}).then(()=>{ showToast('მოსწავლე წაიშალა', 'success'); loadSysStudents(true); }) }">ბაზიდან წაშლა</button></td></tr>`;
    }).join('');
    document.getElementById('sysStudentsArea').innerHTML = header + rows + "</table>"; 
}

async function loginAdmin() { 
    if(await apiCall("checkAdminPass", { pass: document.getElementById('aPass').value })) { document.getElementById('adminLoginForm').style.display = 'none'; document.getElementById('adminContent').style.display = 'block'; switchAdminTab('stats'); showToast("ავტორიზაცია წარმატებულია!", "success"); } else showToast("პაროლი არასწორია!", "error"); 
}
function switchAdminTab(t) { ['Stats', 'List'].forEach(x => { document.getElementById('tab'+x).style.display = 'none'; document.getElementById('btn'+x).classList.remove('active'); }); document.getElementById('tab'+(t==='stats'?'Stats':'List')).style.display = 'block'; document.getElementById('btn'+(t==='stats'?'Stats':'List')).classList.add('active'); if(t==='stats') loadAdminStats(); else loadUnifiedList(); }

async function loadAdminStats(force = false) { 
    if(force) clearCache('students');
    if(!appCache.adminStats) { document.getElementById('adminStatsArea').innerHTML = "<div style='text-align:center; padding:20px;'><div class='spinner' style='margin:0 auto;'></div></div>"; appCache.adminStats = await apiCall("getAdminData"); }
    const s = appCache.adminStats; 
    let buildTbl = (title, obj) => {
        let rows = Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`).join('');
        return `<div style="flex:1; min-width:220px; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 6px rgba(0,0,0,0.02);"><h4 style="margin-top:0; color:var(--primary); border-bottom:2px solid #e2e8f0; padding-bottom:8px;">${title}</h4><table class="data-table" style="margin-top:0; background:transparent; box-shadow:none;">${rows}</table></div>`;
    };
    
    let h = `
    <div style="display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap;">
        <div style="flex:1; min-width:150px; background:linear-gradient(135deg, var(--primary), #2563eb); color:white; padding:20px; border-radius:14px; box-shadow: 0 10px 15px rgba(59,130,246,0.2); position:relative; overflow:hidden;">
            <i class="fas fa-users" style="position:absolute; right:-10px; bottom:-15px; font-size:5rem; opacity:0.2;"></i>
            <h3 style="margin:0; font-size:1.1rem; opacity:0.9;">სულ მოსწავლე</h3><h2 style="margin:10px 0 0 0; font-size:2.2rem;">${s.total}</h2>
        </div>
        <div style="flex:1; min-width:150px; background:linear-gradient(135deg, var(--secondary), #059669); color:white; padding:20px; border-radius:14px; box-shadow: 0 10px 15px rgba(16,185,129,0.2); position:relative; overflow:hidden;">
            <i class="fas fa-user-check" style="position:absolute; right:-10px; bottom:-15px; font-size:5rem; opacity:0.2;"></i>
            <h3 style="margin:0; font-size:1.1rem; opacity:0.9;">ახალი (მიმდინარე)</h3><h2 style="margin:10px 0 0 0; font-size:2.2rem;">${s.newStudents}</h2>
        </div>
        <div style="flex:1; min-width:150px; background:linear-gradient(135deg, #f59e0b, #d97706); color:white; padding:20px; border-radius:14px; box-shadow: 0 10px 15px rgba(245,158,11,0.2); position:relative; overflow:hidden;">
            <i class="fas fa-history" style="position:absolute; right:-10px; bottom:-15px; font-size:5rem; opacity:0.2;"></i>
            <h3 style="margin:0; font-size:1.1rem; opacity:0.9;">ადრეული (ძველი)</h3><h2 style="margin:10px 0 0 0; font-size:2.2rem;">${s.oldStudents}</h2>
        </div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
        <h3 style="margin:0; color:var(--text);">დეტალური მონაცემები</h3>
        <button onclick="loadAdminStats(true)" class="admin-btn print-hide" style="width:auto; padding:8px 15px;"><i class="fas fa-sync"></i> განახლება</button>
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
    if(!globalAdminData || !globalAdminData.length) return showToast("მონაცემები ცარიელია!", "warning");
    let csvContent = "\uFEFFსარეგისტრაციო N;სტატუსი;გვარი;სახელი;პირადი N;სქესი;დაბადების თარიღი;სკოლა;კლასი;საფეხური;კლუბები;მშობლის სახელი;მშობლის ტელეფონი;რეგისტრაციის თარიღი\n"; 
    globalAdminData.forEach((s) => { 
        let gender = s.gender === 'მდ' ? 'მდედრობითი' : (s.gender === 'მმ' ? 'მამრობითი' : s.gender);
        let status = s.isOldStudent ? 'ძველი' : 'ახალი';
        let row = [s.uId, status, s.surname, s.name, s.pId, gender, s.birthDate, s.school, s.classNum, s.gradeLevel, s.clubsStr, s.parentName, s.phone, s.regDate].map(v => `"${(v||'').toString().replace(/"/g, '""')}"`).join(';');
        csvContent += row + '\n'; 
    });
    let encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
    let link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "მოსწავლეების_სია.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("ფაილი იტვირთება...", "success");
}

async function loginDpo() { if(await apiCall("checkDpoPass", { pass: document.getElementById('dPass').value })) { document.getElementById('dpoLoginForm').style.display = 'none'; document.getElementById('dpoContent').style.display = 'block'; loadDpoData(); showToast("ავტორიზაცია წარმატებულია!", "success"); } else showToast("პაროლი არასწორია!", "error"); }
async function loginTeacher() { 
    const r = await apiCall("teacherLogin", { email: document.getElementById('tEmail').value, password: document.getElementById('tPass').value }); 
    if(r.status === 'success'){ 
        currentClub = r.club; 
        currentTeacher = r.teacherName; 
        showSection('teacherDashboard'); 
        
        document.getElementById('teacherGreeting').innerHTML = `<i class="fas fa-hand-sparkles" style="color:#f59e0b;"></i> გამარჯობა, <b>${r.teacherName}</b>`;
        document.getElementById('dashTitle').innerText = currentClub; 
        
        loadStudents(r.club); 
        showToast("ავტორიზაცია წარმატებულია!", "success"); 
    } else {
        showToast("არასწორი მონაცემები!", "error"); 
    }
}

// 📄 მასწავლებლის ცხრილი 
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
                <table class="data-table"><tr><th><i class="fas fa-check"></i></th><th>მოსწავლე</th><th>პირადი N</th><th class="print-hide">სტატუსი</th><th class="print-hide">მართვა</th><th class="print-hide" style="text-align:center;">დოკუმენტები</th></tr>`; 
                
       const rows = l.map(s => {
           let badge = getNewBadge(s.timestamp); let oldBadge = s.isOldStudent ? `<span class="old-badge"><i class="fas fa-history"></i> ძველი</span>` : '';
           let deleteBtn = s.deleteRequest ? `<button class="del-btn" style="background:#94a3b8; cursor:not-allowed;" disabled>⏳ მოთხოვნილია</button>` : `<button class="del-btn" onclick="requestDelete('${s.docId}')"><i class="fas fa-trash"></i> წაშლა</button>`;
           let stuData = encodeURIComponent(JSON.stringify({ date: s.regDate || "", name: `${s.name} ${s.surname}`, pId: s.pId, school: s.school || "", classNum: s.classNum || "", parentName: s.parentName || "", phone: s.phone || "", clubs: (s.clubsStr || (s.clubs ? s.clubs.join(", ") : "")), club: currentClub, uId: s.uId || "", appType: s.appType || "parent", isSpecial: s.consent?.includes("გაციფრებული") }));
           let dpoHtml = s.consent?.includes("გაციფრებული") ? "" : `<button class="doc-btn" title="თანხმობის გადმოწერა" onclick="generateDpoDoc('${stuData}')" style="background:#f59e0b;"><i class="fas fa-file-download"></i> DPO</button>`;
           
           return `<tr>
              <td><input type="checkbox" class="att-check" value="${s.pId}" style="width:18px; height:18px; margin:0; accent-color:var(--secondary);"></td>
              <td><b>${s.surname} ${s.name}</b> ${badge} ${oldBadge}<br><small style="color:#64748b;">სხვა კლუბები: ${s.otherClubs}</small></td>
              <td>${s.pId}</td>
              <td class="print-hide">
                 <label style="font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; color:#475569; background:#f1f5f9; padding:4px 8px; border-radius:6px; width:max-content;">
                    <input type="checkbox" onchange="toggleOldStudent('${s.docId}', this)" ${s.isOldStudent ? 'checked' : ''} style="width:14px; height:14px; margin:0;"> ადრეული
                 </label>
              </td>
              <td class="print-hide">${deleteBtn}</td>
              <td class="print-hide" style="text-align:center; white-space:nowrap;">
                  <button class="doc-btn" title="განცხადების გადმოწერა" onclick="generateAppDoc('${stuData}')" style="background:var(--primary); margin-right:5px;"><i class="fas fa-file-download"></i> განცხ.</button>
                  ${dpoHtml}
              </td>
           </tr>`;
       }).join('');
       document.getElementById('studentList').innerHTML = header + rows + "</table>"; 
   } catch(e) { document.getElementById('studentList').innerHTML = '<div style="color:var(--danger); padding:15px; font-weight:bold;">ჩატვირთვის შეცდომა.</div>'; }
}

async function saveAttendance() {
   let ids = Array.from(document.querySelectorAll('.att-check:checked')).map(c => c.value);
   if(!ids.length) return showToast("მონიშნეთ მოსწავლეები!", "warning");
   const msg = await apiCall("saveAttendance", { club: currentClub, teacher: currentTeacher, studentsList: ids });
   showToast("დასწრება წარმატებით შეინახა!", "success"); document.querySelectorAll('.att-check').forEach(c=>c.checked=false);
}

// 📄 ადმინის სრული სია 
async function loadUnifiedList(force = false) { 
    if(force) clearCache('students');
    if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    const l = appCache.unifiedList; globalAdminData = l;
    
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadUnifiedList(true)"><i class="fas fa-sync"></i> მონაცემების განახლება</button></div>
             <table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>პირადი N</th><th>კლუბები</th><th class="print-hide" style="text-align:center;">დოკუმენტები</th></tr>`; 
             
    const rows = l.map(s => {
        let badge = getNewBadge(s.timestamp); let oldBadge = s.isOldStudent ? `<span class="old-badge"><i class="fas fa-history"></i> ძველი</span>` : '';
        let rowStyle = s.deleteRequest ? 'background: #fef2f2;' : ''; 
        let deleteAlert = s.deleteRequest ? 
            `<div style="margin-top:8px; padding:8px; background:var(--danger); color:white; border-radius:8px; font-size:12px; display:inline-block; box-shadow:0 4px 6px rgba(239,68,68,0.2);">
                <i class="fas fa-exclamation-triangle"></i> <b>წაშლის მოთხოვნა:</b> მასწ. ${s.deleteRequestedBy} (${s.deleteRequestedClub})
                <div style="margin-top:6px; display:flex; gap:8px;">
                    <button onclick="approveDelete('${s.docId}')" style="background:white; color:var(--danger); border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-weight:bold;"><i class="fas fa-check"></i> დადასტურება</button>
                    <button onclick="rejectDelete('${s.docId}')" style="background:transparent; border:1px solid white; color:white; padding:4px 10px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i> უარყოფა</button>
                </div>
            </div>` : '';
        
        let stuData = encodeURIComponent(JSON.stringify({ date: s.regDate || "", name: `${s.name} ${s.surname}`, pId: s.pId, school: s.school || "", classNum: s.classNum || "", parentName: s.parentName || "", phone: s.phone || "", clubs: s.clubsStr, club: s.clubsStr, uId: s.uId || "", appType: s.appType || "parent", isSpecial: s.consent?.includes("გაციფრებული") }));
        let dpoHtml = s.consent?.includes("გაციფრებული") ? "" : `<button class="doc-btn" title="თანხმობის გადმოწერა" onclick="generateDpoDoc('${stuData}')" style="background:#f59e0b;"><i class="fas fa-file-download"></i> DPO</button>`;
        
        return `<tr style="${rowStyle}"><td>${s.uId}</td><td><b>${s.surname} ${s.name}</b> ${badge} ${oldBadge} ${deleteAlert}</td><td>${s.pId}</td><td>${s.clubsStr}</td>
              <td class="print-hide" style="text-align:center; white-space:nowrap; vertical-align:top;">
                  <button class="doc-btn" title="განცხადების გადმოწერა" onclick="generateAppDoc('${stuData}')" style="background:var(--primary); margin-right:5px;"><i class="fas fa-file-download"></i> განცხ.</button>
                  ${dpoHtml}
              </td></tr>`;
    }).join('');
    document.getElementById('unifiedListArea').innerHTML = header + rows + "</table>"; 
}

// 📄 DPO პანელი
async function loadDpoData(force = false) { 
    if(force) clearCache('students');
    if(!appCache.dpoList) { document.getElementById('dpoListArea').innerHTML = "<div style='text-align:center; padding:20px;'><div class='spinner' style='margin:0 auto; width:30px; height:30px; border-width:3px;'></div></div>"; appCache.dpoList = await apiCall("getDpoData"); }
    const l = appCache.dpoList; globalDpoData = l;
    
    const header = `<div style="text-align:right; margin-bottom:10px;"><button class="admin-btn print-hide" onclick="loadDpoData(true)"><i class="fas fa-sync"></i> განახლება</button></div>
             <table class="data-table"><tr><th>თარიღი</th><th>გვარი სახელი</th><th>პირადი N</th><th>ტელეფონი</th><th>სტატუსი</th><th class="print-hide" style="text-align:center;">დოკუმენტები</th></tr>`; 
             
    const rows = l.map(s => {
        let badge = getNewBadge(s.timestamp); let oldBadge = s.isOldStudent ? `<span class="old-badge"><i class="fas fa-history"></i> ძველი</span>` : '';
        let statusColor = s.consent.includes("დადასტურებულია") ? "var(--secondary)" : "var(--danger)";
        let clubsJoined = s.clubsStr || (s.clubs ? s.clubs.join(", ") : "");
        let stuData = encodeURIComponent(JSON.stringify({ date: s.regDate || "", name: `${s.name} ${s.surname}`, pId: s.pId, school: s.school || "", classNum: s.classNum || "", parentName: s.parentName || "", phone: s.phone || "", clubs: clubsJoined, club: clubsJoined, uId: s.uId || "", appType: s.appType || "parent", isSpecial: s.consent?.includes("გაციფრებული") }));
        let dpoHtml = s.consent?.includes("გაციფრებული") ? "" : `<button class="doc-btn" title="თანხმობის გადმოწერა" onclick="generateDpoDoc('${stuData}')" style="background:#f59e0b;"><i class="fas fa-file-download"></i> DPO</button>`;
        
        return `<tr><td>${s.regDate}</td><td><b>${s.surname} ${s.name}</b> ${badge} ${oldBadge}<br><small style="color:#64748b;">${clubsJoined}</small></td><td>${s.pId}</td><td><a href="tel:${s.phone}" style="text-decoration:none; color:var(--primary); font-weight:500;">${s.phone}</a></td><td style="color:${statusColor}; font-weight:bold;">${s.consent}</td>
              <td class="print-hide" style="text-align:center; white-space:nowrap;">
                  <button class="doc-btn" title="განცხადების გადმოწერა" onclick="generateAppDoc('${stuData}')" style="background:var(--primary); margin-right:5px;"><i class="fas fa-file-download"></i> განცხ.</button>
                  ${dpoHtml}
              </td></tr>`;
    }).join('');
    document.getElementById('dpoListArea').innerHTML = header + rows + "</table>"; 
}

function generateDpoDoc(encodedDataStr) {
    const s = JSON.parse(decodeURIComponent(encodedDataStr)); 
    const docWindow = window.open('', '_blank');
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
      <div><b>მე, ქვევით ხელმომწერი</b> <span class="blank-line">${s.parentName}</span></div>
      <div class="small-label">(მშობლის/კანონიერი წარმომადგენლის სახელი, გვარი)</div>
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

function generateAppDoc(encodedDataStr) {
    const s = JSON.parse(decodeURIComponent(encodedDataStr)); 
    const docWindow = window.open('', '_blank');
    let day = "___", month = "___", year = "___"; let dateStr = "___";
    
    if (s.date) { 
        dateStr = s.date.split(',')[0].trim(); 
        let parts = dateStr.includes('-') ? dateStr.split('-').reverse() : dateStr.split('/'); 
        if (parts.length >= 3) { day = parts[0]; month = parts[1]; year = parts[2].substring(2); } 
    }
    
    const qrData = encodeURIComponent(`თერჯოლის ცენტრი | განცხადება\nN: ${s.uId}\nმოსწავლე: ${s.name}\nთარიღი: ${dateStr}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;

    let htmlContent = "";

    // მოსწავლის განცხადების ფორმა 
    if (s.appType === "student") {
        htmlContent = `
        <html><head><title>განცხადება - ${s.name}</title>
        <style> @media print { @page { size: A4; margin: 20mm; } } body { font-family: 'Sylfaen', serif; padding: 0; max-width: 800px; margin: auto; line-height: 1.6; color: #000; font-size: 15px;} .doc-wrapper { padding: 10px; } .reg-id { text-align: right; font-size: 13px; font-family: sans-serif; color: #000; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; } .clearfix::after { content: ""; clear: both; display: table; } .header-right { text-align: right; margin-left: auto; width: 60%; font-size: 14px; margin-bottom: 50px; line-height: 1.5; margin-top: 20px;} .title { text-align: center; font-weight: bold; font-size: 22px; letter-spacing: 8px; margin: 40px 0 50px 0;} .body-text { text-align: justify; line-height: 2.2; font-size: 15px; } .blank-line { display: inline-block; border-bottom: 1px dashed #000; text-align: center; padding: 0 10px; font-weight: bold; color: #000; text-decoration: none; min-width: 50px;} .footer-right { text-align: left; margin-left: 60%; margin-top: 70px; line-height: 2.2; font-size: 15px;} .sig-line { display: inline-block; font-weight: bold; font-size: 15px; color: #000; } </style>
        </head><body><div class="doc-wrapper clearfix">
          <img src="${qrUrl}" style="float: left; width: 85px; height: 85px;" alt="QR Code"><div class="reg-id" style="float: right;">სარეგისტრაციო N: ${s.uId || "__________"}</div><div style="clear:both;"></div>
          <div class="header-right">ა (ა) იპ თერჯოლის მოსწავლე-ახალგაზრდობის<br>სოციალური დაცვის, მოქალაქეობრივი და ესთეტიკური<br>აღზრდის მუნიციპალური ცენტრის დირექტორს<br>ქალბატონ ნათია მოსიაშვილს<br><div style="font-size: 12px; margin-top: 5px;">(მოსწავლის სახელი, გვარი)</div><div class="blank-line" style="min-width: 250px; text-align: right; margin-top: 5px;">${s.name}</div></div>
          <div class="title">გ ა ნ ც ხ ა დ ე ბ ა</div>
          <div class="body-text">სურვილი მაქვს ჩავირიცხო კლუბი (წრე) <span class="blank-line" style="min-width: 250px;">${s.club}</span><br><br><span class="blank-line" style="min-width: 200px;">${s.school}</span> სკოლა <span class="blank-line" style="min-width: 100px;">${s.classNum}</span> კლასი</div>
          <div class="footer-right">თარიღი: <span class="blank-line" style="min-width: 150px;">${day} / ${month} / 20${year} წ.</span><br>ხელმოწერა: <span class="blank-line" style="min-width: 150px;"><span class="sig-line">${s.name}</span></span><br>საკონტაქტო: <span class="blank-line" style="min-width: 150px; margin-top: 5px;">${s.phone}</span></div>
         </div><script>setTimeout(() => { window.print(); }, 800);<\/script></body></html>`;
    } 
    // მშობლის განცხადების ფორმა 
    else {
        htmlContent = `
        <html><head><title>განცხადება - ${s.name}</title>
        <style> @media print { @page { size: A4; margin: 20mm; } } body { font-family: 'Sylfaen', serif; padding: 0; max-width: 800px; margin: auto; line-height: 1.6; color: #000; font-size: 15px;} .doc-wrapper { padding: 10px; } .reg-id { text-align: right; font-size: 13px; font-family: sans-serif; color: #000; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; } .clearfix::after { content: ""; clear: both; display: table; } .header-right { text-align: right; margin-left: auto; width: 60%; font-size: 14px; margin-bottom: 50px; line-height: 1.5; margin-top: 20px;} .title { text-align: center; font-weight: bold; font-size: 22px; letter-spacing: 8px; margin: 40px 0 50px 0;} .body-text { text-align: justify; line-height: 2.2; font-size: 15px; } .blank-line { display: inline-block; border-bottom: 1px dashed #000; text-align: center; padding: 0 10px; font-weight: bold; color: #000; text-decoration: none; min-width: 50px;} .footer-right { text-align: left; margin-left: 60%; margin-top: 70px; line-height: 2.2; font-size: 15px;} .sig-line { display: inline-block; font-weight: bold; font-size: 15px; color: #000; } </style>
        </head><body><div class="doc-wrapper clearfix">
          <img src="${qrUrl}" style="float: left; width: 85px; height: 85px;" alt="QR Code"><div class="reg-id" style="float: right;">სარეგისტრაციო N: ${s.uId || "__________"}</div><div style="clear:both;"></div>
          <div class="header-right">ა (ა) იპ თერჯოლის მოსწავლე-ახალგაზრდობის<br>სოციალური დაცვის, მოქალაქეობრივი და ესთეტიკური<br>აღზრდის მუნიციპალური ცენტრის დირექტორს<br>ქალბატონ ნათია მოსიაშვილს<br><div style="font-size: 12px; margin-top: 5px;">(მშობლის სახელი, გვარი)</div><div class="blank-line" style="min-width: 250px; text-align: right; margin-top: 5px;">${s.parentName}</div></div>
          <div class="title">გ ა ნ ც ხ ა დ ე ბ ა</div>
          <div class="body-text">სურვილი მაქვს ჩაირიცხოს ჩემი შვილი <span class="blank-line" style="min-width: 300px;">${s.name}</span><br>კლუბი (წრე) <span class="blank-line" style="min-width: 200px;">${s.club}</span> სკოლა <span class="blank-line" style="min-width: 150px;">${s.school}</span> კლასი <span class="blank-line" style="min-width: 50px;">${s.classNum}</span></div>
          <div class="footer-right">თარიღი: <span class="blank-line" style="min-width: 150px;">${day} / ${month} / 20${year} წ.</span><br>ხელმოწერა: <span class="blank-line" style="min-width: 150px;"><span class="sig-line">${s.parentName}</span></span><br>საკონტაქტო: <span class="blank-line" style="min-width: 150px; margin-top: 5px;">${s.phone}</span></div>
         </div><script>setTimeout(() => { window.print(); }, 800);<\/script></body></html>`;
    }

    docWindow.document.write(htmlContent); docWindow.document.close();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      registration.update(); // სერვერზე ვერსიის იძულებითი შემოწმება
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload(); // ახალი ვერსიისას გვერდის ავტომატური რესტარტი
          }
        };
      };
    }).catch(err => console.log('SW შეცდომა:', err));
  });
}