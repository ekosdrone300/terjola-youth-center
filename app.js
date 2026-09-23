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

// 💥 FCM ინიციალიზაცია უსაფრთხოების ბლოკით (Safari-ს გაჭედვის თავიდან ასაცილებლად)
let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
    
    // წინა პლანზე (საიტზე ყოფნისას) მოსული მესიჯის დამუშავება
    messaging.onMessage((payload) => {
      console.log('მიღებული მესიჯი ეკრანზე:', payload);
      showToast(`🔔 ${payload.notification.title} - ${payload.notification.body}`, "success");
      
      if (Notification.permission === 'granted') {
          new Notification(payload.notification.title, {
              body: payload.notification.body,
              icon: '/logo.png'
          });
      }
    });
  }
} catch(e) {
  console.log('FCM შეტყობინებები ამ ბრაუზერში შეზღუდულია (Safari / Incognito).');
}

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
              } catch(e) { console.error("მეილის შეცდომა:", e); }

              try {
                  await fetch('/api/sendPush', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: p.name, surname: p.surname, clubs: p.clubs })
                  });
              } catch(e) { console.error("პუშის შეცდომა:", e); }
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
          await db.collection("students").doc(data.docId).update({ deleteRequest: true, deleteRequestedBy: data.teacher, deleteRequestedClub: data.club });
          clearCache('students'); return "success: წაშლის მოთხოვნა გაიგზავნა ადმინისტრატორთან!";
      }
      if (action === "rejectDelete") {
          await db.collection("students").doc(data.docId).update({ deleteRequest: firebase.firestore.FieldValue.delete(), deleteRequestedBy: firebase.firestore.FieldValue.delete(), deleteRequestedClub: firebase.firestore.FieldValue.delete() });
          clearCache('students'); return "success";
      }
      if (action === "deleteStudentByDoc") { await db.collection("students").doc(data.docId).delete(); clearCache('students'); return "success"; }
      if (action === "markOldStudent") { await db.collection("students").doc(data.docId).update({ isOldStudent: data.isOld }); clearCache('students'); return "success"; }
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

// UI ფუნქციები
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

// 💥 FCM გამოწერა (დაცული Safari-სთვის)
async function subscribeToNotifications() {
    try {
        if (!messaging) {
            return showToast("შეტყობინებების გამოსაწერად საიტი დაამატეთ მთავარ ეკრანზე (აიფონზე) ან გამოიყენეთ Chrome", "warning");
        }
        
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
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
        showToast("შეცდომა გამოწერისას", "error");
    }
}

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
       name: document.getElementById('spName').value, surname: document.getElementById('spSurname').value, personalId: document.getElementById('spPId').value || "-", school: document.getElementById('spSchool').value, classNum: document.getElementById('spClass').value, parentName: pName + (pSurname ? " " + pSurname : ""), parentPhone: document.getElementById('spPhone').value, clubs: selectedClubs, customRegDate: customDateStr, appType: appType, isSpecial: true
   };
   
   const msg = await apiCall("registerStudent", { payload: payloadData });
   if(msg.includes("success")) { 
       showToast("მონაცემები წარმატებით გაციფრულდა!", "success"); 
       document.getElementById('spRegModal').style.display = 'none';
       ['spDate','spName','spSurname','spPId','spSchool','spClass','spParentName','spParentSurname','spPhone'].forEach(id => document.getElementById(id).value='');
       loadStudents(currentClub, true); 
   } else showToast(msg, "error"); 
   document.getElementById('spRegBtn').innerHTML = '<i class="fas fa-save"></i> სისტემაში დამატება';
}

function showSection(id) { 
    if (id === 'studentReg' && appCache.sysStatus.regDisabled) return showToast("რეგისტრაცია დროებით შეჩერებულია.", "warning");
    if (id === 'teacherLogin' && appCache.sysStatus.teacherDisabled) return showToast("მასწავლებლის პანელი გათიშულია.", "warning");
    if (id === 'adminPanel' && appCache.sysStatus.adminDisabled) return showToast("ადმინის პანელი გათიშულია.", "warning");
    if (id === 'dpoPanel' && appCache.sysStatus.dpoDisabled) return showToast("DPO პანელი გათიშულია.", "warning");

    document.getElementById('mainMenu').style.display = 'none'; 
    document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); 
    document.getElementById(id).style.display = 'block'; 
}

function goHome() { document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none'); document.getElementById('mainMenu').style.display = 'flex'; }
function openSchedule() {
    let modal = document.getElementById('scheduleModal'); let content = document.getElementById('scheduleContent'); modal.style.display = 'flex';
    if (!cachedClubs || cachedClubs.length === 0) { content.innerHTML = '<p style="color:var(--danger); font-weight:bold;">განრიგი ცარიელია.</p>'; return; }
    let html = '<table class="data-table"><tr><th>კლუბი</th><th>განრიგი</th></tr>';
    cachedClubs.forEach(c => { html += `<tr><td><b>${c[0]}</b></td><td>${c[2] || "-"}</td></tr>`; });
    content.innerHTML = html + '</table>';
}
function filterTable(id, tableId) { let input = document.getElementById(id).value.toLowerCase(); let tr = document.querySelectorAll(`#${tableId} tr`); tr.forEach((r, i) => { if(i>0) r.style.display = r.innerText.toLowerCase().includes(input) ? "" : "none"; }); }
function acceptTerms() { document.getElementById('termsModal').style.display = 'none'; document.getElementById('checkConsent').checked = true; document.getElementById('consentLabel').style.opacity = '1'; showToast("თანხმობა დადასტურებულია", "success"); }
function toggleChat() { let w = document.getElementById('ai-chat-window'); w.style.display = w.style.display === 'none' || w.style.display === '' ? 'flex' : 'none'; }
function handleChatEnter(e) { if(e.key === 'Enter') sendChatMessage(); }
setInterval(() => { document.getElementById('liveClock').innerText = new Date().toLocaleString('ka-GE'); }, 1000);
function getNewBadge(timestamp) {
    if(!timestamp) return "";
    let diffHours = (new Date() - timestamp.toDate()) / (1000 * 60 * 60);
    return diffHours < 24 ? `<span style="background:var(--accent); color:white; padding:3px 6px; border-radius:10px; font-size:10px; margin-left:6px;"><i class="fas fa-bell"></i> ახალი</span>` : "";
}

window.toggleOldStudent = async function(docId, cb) {
    let isOld = cb.checked; cb.disabled = true;
    try {
        await apiCall("markOldStudent", { docId: docId, isOld: isOld });
        if(appCache.teacherStudents) { let st = appCache.teacherStudents.find(x => x.docId === docId); if(st) st.isOldStudent = isOld; }
        if(appCache.unifiedList) { let st = appCache.unifiedList.find(x => x.docId === docId); if(st) st.isOldStudent = isOld; }
        loadStudents(currentClub, false); showToast("სტატუსი განახლდა", "success");
    } catch(e) { showToast("შეცდომა", "error"); cb.checked = !isOld; }
    cb.disabled = false;
}
window.requestDelete = async function(docId) {
    if(!confirm("მოთხოვნის გაგზავნა?")) return;
    await apiCall("requestDeleteStudent", { docId: docId, teacher: currentTeacher, club: currentClub });
    showToast("გაიგზავნა!", "success"); loadStudents(currentClub, true);
}
window.approveDelete = async function(docId) {
    if(!confirm("საბოლოოდ წაშლა?")) return;
    await apiCall("deleteStudentByDoc", { docId: docId }); showToast("წაიშალა.", "success"); loadUnifiedList(true); loadAdminStats(true);
}
window.rejectDelete = async function(docId) { await apiCall("rejectDelete", { docId: docId }); showToast("გაუქმდა.", "info"); loadUnifiedList(true); }

async function submitRegistration() {
   let valid = true; ['sName', 'sSurname', 'sSchool', 'sClass', 'sGradeLevel', 'sParentName', 'sParentSurname', 'sParentPhone'].forEach(id => { if(!document.getElementById(id).value) valid = false; });
   let selectedClubs = Array.from(document.querySelectorAll('.club-checkbox:checked')).map(cb => cb.value);
   
   if(!valid || selectedClubs.length === 0) return showToast("შეავსეთ სავალდებულო ველები და მონიშნეთ 1 კლუბი!", "error");
   if(!document.getElementById('checkInfo').checked || !document.getElementById('checkConsent').checked) return showToast("დაეთანხმეთ დოკუმენტს!", "warning");
   
   let classLevel = parseInt(document.getElementById('sClass').value);
   if (selectedClubs.some(club => club.includes("რობოტექნიკა")) && classLevel < 6) return showToast("რობოტექნიკა მხოლოდ მე-6+ კლასისთვისაა.", "warning");
   
   document.getElementById('regBtn').innerText = "იგზავნება...";
   const payloadData = { 
       name: document.getElementById('sName').value, surname: document.getElementById('sSurname').value, personalId: document.getElementById('sPId').value, birthDate: document.getElementById('sBirthDate').value, gender: document.getElementById('sGender').value, school: document.getElementById('sSchool').value, classNum: document.getElementById('sClass').value, gradeLevel: document.getElementById('sGradeLevel').value, parentName: document.getElementById('sParentName').value.trim() + " " + document.getElementById('sParentSurname').value.trim(), parentPhone: document.getElementById('sParentPhone').value, parentEmail: document.getElementById('sParentEmail').value, clubs: selectedClubs 
   };
   
   const msg = await apiCall("registerStudent", { payload: payloadData });
   if(msg.includes("success")) { showToast("დარეგისტრირდით!", "success"); goHome(); } else { showToast(msg, "error"); }
   document.getElementById('regBtn').innerHTML = '<i class="fas fa-paper-plane"></i> დარეგისტრირება';
}

async function loginSysAdmin() {
   if((await apiCall("sysAdminLogin", { pass: document.getElementById('sysPass').value })).success) { document.getElementById('sysLoginForm').style.display = 'none'; document.getElementById('sysContent').style.display = 'block'; switchSysTab('Clubs'); showToast("წარმატებულია!", "success"); } else showToast("პაროლი არასწორია!", "error");
}
window.toggleSysStatus = async function(field, val) { await db.collection("clubs").doc("system_status").set({ [field]: val }, { merge: true }); }
function switchSysTab(t) { ['Clubs', 'Staff', 'Students', 'Settings'].forEach(x => { let tab = document.getElementById('tabSys'+x); let btn = document.getElementById('btnSys'+x); if(tab) tab.style.display = 'none'; if(btn) btn.classList.remove('active'); }); document.getElementById('tabSys'+t).style.display = 'block'; document.getElementById('btnSys'+t).classList.add('active'); if(t==='Clubs') loadSysClubs(); if(t==='Staff') loadSysStaff(); if(t==='Students') loadSysStudents(); }

async function loadSysClubs(force = false) { 
    if(force) clearCache('clubs'); if(!appCache.clubs) appCache.clubs = await apiCall("getClubData");
    document.getElementById('sysClubsArea').innerHTML = `<table class="data-table"><tr><th>კლუბი</th><th>ლიმიტი</th><th>მოქმედება</th></tr>` + appCache.clubs.map(c => `<tr><td><b>${c[0]}</b></td><td>${c[1]}</td><td><button onclick="apiCall('deleteSysClub', {name:'${c[0]}'}).then(()=>loadSysClubs(true))">წაშლა</button></td></tr>`).join('') + "</table>"; 
}
async function addSysClub() { await apiCall("addSysClub", { name: document.getElementById('newClubName').value, limit: document.getElementById('newClubLimit').value, schedule: document.getElementById('newClubSchedule').value }); loadSysClubs(true); }
async function loadSysStaff(force = false) { 
    if(force) clearCache('staff'); if(!appCache.staff) appCache.staff = await apiCall("getSysStaff");
    document.getElementById('sysStaffArea').innerHTML = `<table class="data-table"><tr><th>სახელი</th><th>მეილი/პაროლი</th><th>კლუბი</th><th>მოქმედება</th></tr>` + appCache.staff.map(t => `<tr><td>${t.name}</td><td>${t.email} (${t.pass})</td><td>${t.club}</td><td><button onclick="apiCall('deleteSysStaff', {email:'${t.email}'}).then(()=>loadSysStaff(true))">წაშლა</button></td></tr>`).join('') + "</table>"; 
}
async function addSysStaff() { await apiCall("addSysStaff", { name: document.getElementById('newStaffName').value, email: document.getElementById('newStaffEmail').value, pass: document.getElementById('newStaffPass').value, club: document.getElementById('newStaffClub').value }); loadSysStaff(true); }
async function loadSysStudents(force = false) { 
    if(force) clearCache('students'); if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    document.getElementById('sysStudentsArea').innerHTML = `<table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>მოქმედება</th></tr>` + appCache.unifiedList.map(s => `<tr><td>${s.uId}</td><td>${s.surname} ${s.name}</td><td><button onclick="apiCall('deleteStudent', {uId:'${s.uId}'}).then(()=>loadSysStudents(true))">წაშლა</button></td></tr>`).join('') + "</table>"; 
}

async function loginAdmin() { 
    if(await apiCall("checkAdminPass", { pass: document.getElementById('aPass').value })) { document.getElementById('adminLoginForm').style.display = 'none'; document.getElementById('adminContent').style.display = 'block'; switchAdminTab('stats'); } else showToast("შეცდომა", "error"); 
}
function switchAdminTab(t) { ['Stats', 'List'].forEach(x => { document.getElementById('tab'+x).style.display = 'none'; document.getElementById('btn'+x).classList.remove('active'); }); document.getElementById('tab'+(t==='stats'?'Stats':'List')).style.display = 'block'; document.getElementById('btn'+(t==='stats'?'Stats':'List')).classList.add('active'); if(t==='stats') loadAdminStats(); else loadUnifiedList(); }

async function loadAdminStats(force = false) { 
    if(force) clearCache('students');
    if(!appCache.adminStats) appCache.adminStats = await apiCall("getAdminData");
    const s = appCache.adminStats; 
    document.getElementById('adminStatsArea').innerHTML = `
    <div style="display:flex; gap:15px; margin-bottom:20px;">
        <div style="flex:1; background:var(--primary); color:white; padding:20px; border-radius:14px;"><h3>სულ</h3><h2>${s.total}</h2></div>
        <div style="flex:1; background:var(--secondary); color:white; padding:20px; border-radius:14px;"><h3>ახალი</h3><h2>${s.newStudents}</h2></div>
        <div style="flex:1; background:#f59e0b; color:white; padding:20px; border-radius:14px;"><h3>ძველი</h3><h2>${s.oldStudents}</h2></div>
    </div>`; 
}
function downloadAdminCSV() {
    if(!globalAdminData || !globalAdminData.length) return;
    let csvContent = "\uFEFFსარეგისტრაციო N;სტატუსი;გვარი;სახელი;პირადი N;სქესი;კლუბები\n"; 
    globalAdminData.forEach(s => csvContent += `"${s.uId}";"${s.isOldStudent?'ძველი':'ახალი'}";"${s.surname}";"${s.name}";"${s.pId}";"${s.gender}";"${s.clubsStr}"\n`);
    let link = document.createElement("a"); link.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent)); link.setAttribute("download", "სია.csv");
    document.body.appendChild(link); link.click();
}

async function loginDpo() { if(await apiCall("checkDpoPass", { pass: document.getElementById('dPass').value })) { document.getElementById('dpoLoginForm').style.display = 'none'; document.getElementById('dpoContent').style.display = 'block'; loadDpoData(); } }
async function loginTeacher() { 
    const r = await apiCall("teacherLogin", { email: document.getElementById('tEmail').value, password: document.getElementById('tPass').value }); 
    if(r.status === 'success'){ currentClub = r.club; currentTeacher = r.teacherName; showSection('teacherDashboard'); document.getElementById('dashTitle').innerText = r.club; loadStudents(r.club); } else showToast("შეცდომა!", "error");
}

async function loadStudents(c, force = false) { 
   if(force) clearCache('students');
   if(!appCache.teacherStudents) appCache.teacherStudents = await apiCall("getStudentsForTeacher", { clubName: c });
   const l = appCache.teacherStudents; 
   const header = `<button onclick="saveAttendance()">დასწრების შენახვა</button><table class="data-table"><tr><th>V</th><th>მოსწავლე</th><th>სტატუსი</th><th>მართვა</th><th>დოკ.</th></tr>`; 
   const rows = l.map(s => `<tr>
          <td><input type="checkbox" class="att-check" value="${s.pId}"></td>
          <td><b>${s.surname} ${s.name}</b> ${s.isOldStudent ? '(ძველი)' : ''}</td>
          <td><input type="checkbox" onchange="toggleOldStudent('${s.docId}', this)" ${s.isOldStudent ? 'checked' : ''}></td>
          <td>${s.deleteRequest ? 'მოთხოვნილია' : `<button onclick="requestDelete('${s.docId}')">წაშლა</button>`}</td>
          <td><button onclick="generateAppDoc('${encodeURIComponent(JSON.stringify(s))}')">განცხ.</button></td>
       </tr>`).join('');
   document.getElementById('studentList').innerHTML = header + rows + "</table>"; 
}
async function saveAttendance() {
   let ids = Array.from(document.querySelectorAll('.att-check:checked')).map(c => c.value);
   if(ids.length) { await apiCall("saveAttendance", { club: currentClub, teacher: currentTeacher, studentsList: ids }); showToast("შეინახა!", "success"); }
}

async function loadUnifiedList(force = false) { 
    if(force) clearCache('students'); if(!appCache.unifiedList) appCache.unifiedList = await apiCall("getUnifiedData");
    globalAdminData = appCache.unifiedList;
    document.getElementById('unifiedListArea').innerHTML = `<table class="data-table"><tr><th>N</th><th>მოსწავლე</th><th>მართვა</th></tr>` + globalAdminData.map(s => `<tr><td>${s.uId}</td><td>${s.surname} ${s.name} ${s.deleteRequest ? '<br>წაშლის მოთხოვნა' : ''}</td><td>${s.deleteRequest ? `<button onclick="approveDelete('${s.docId}')">დასტურ</button> <button onclick="rejectDelete('${s.docId}')">უარყოფა</button>` : ''}</td></tr>`).join('') + "</table>"; 
}

async function loadDpoData(force = false) { 
    if(force) clearCache('students'); if(!appCache.dpoList) appCache.dpoList = await apiCall("getDpoData");
    document.getElementById('dpoListArea').innerHTML = `<table class="data-table"><tr><th>თარიღი</th><th>მოსწავლე</th><th>სტატუსი</th></tr>` + appCache.dpoList.map(s => `<tr><td>${s.regDate}</td><td>${s.surname} ${s.name}</td><td>${s.consent}</td></tr>`).join('') + "</table>"; 
}

function generateDpoDoc(encoded) { let s = JSON.parse(decodeURIComponent(encoded)); let w = window.open('','_blank'); w.document.write(`<html><body><h2>DPO ${s.name}</h2><script>window.print();</script></body></html>`); w.document.close(); }
function generateAppDoc(encoded) { let s = JSON.parse(decodeURIComponent(encoded)); let w = window.open('','_blank'); w.document.write(`<html><body><h2>განცხადება ${s.name}</h2><script>window.print();</script></body></html>`); w.document.close(); }

// 💥 PWA Service Worker (უსაფრთხო, ციკლური გადატვირთვის გარეშე)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('SW დარეგისტრირდა', registration.scope))
      .catch(err => console.log('SW შეცდომა:', err));
  });
}