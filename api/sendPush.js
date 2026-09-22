const admin = require('firebase-admin');

// 💥 გასაღების ფორმატის ავტომატური გასწორება
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
    privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { name, surname, clubs } = req.body;

  try {
    const db = admin.firestore();
    const tokensSnap = await db.collection('fcmTokens').get();
    let targetTokens = [];
    
    tokensSnap.forEach(doc => {
      const data = doc.data();
      // ფილტრაცია: თუ ადმინია ან კლუბი ემთხვევა
      if (data.userType === "Admin" || (data.club && clubs.includes(data.club))) {
        if (data.token) targetTokens.push(data.token);
      }
    });

    if (targetTokens.length === 0) return res.status(200).json({ message: 'ადრესატი არ მოიძებნა' });

    const message = {
      notification: {
        title: 'ახალი მოსწავლე ცენტრში!',
        body: `${name} ${surname} დარეგისტრირდა: ${clubs.join(', ')}`
      },
      tokens: targetTokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error('შეცდომა გაგზავნისას:', error);
    res.status(500).json({ error: error.message });
  }
};