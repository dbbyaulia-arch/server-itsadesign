const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Server itsadesign: Webhook Handler Ready.');
});

// Endpoint untuk Moota Webhook
app.post('/moota-webhook', async (req, res) => {
    try {
        const mootaSignature = req.headers['authorization'];
        if (mootaSignature !== process.env.MOOTA_SECRET_TOKEN) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const mutasiMasuk = req.body; 

        for (const mutasi of mutasiMasuk) {
            if (mutasi.type === 'CR') { // Uang Masuk
                const nominal = parseInt(mutasi.amount);

                // 1. Cari transaksi PENDING yang nominalnya cocok
                const txQuery = await db.collection('TRANSAKSI_PEMBAYARAN')
                    .where('total_bayar', '==', nominal)
                    .where('status', '==', 'PENDING')
                    .limit(1)
                    .get();

                if (!txQuery.empty) {
                    const txDoc = txQuery.docs[0];
                    const txData = txDoc.data();

                    // 2. Ambil data poin dari master data PAKET_LANGGANAN
                    const paketDoc = await db.collection('PAKET_LANGGANAN').doc(txData.id_paket).get();
                    
                    if (paketDoc.exists) {
                        const poinDidapat = paketDoc.data().poin_didapat;
                        const batch = db.batch();

                        // 3. Update Status Transaksi jadi SUCCESS
                        batch.update(txDoc.ref, { 
                            status: 'SUCCESS', 
                            paid_at: admin.firestore.FieldValue.serverTimestamp() 
                        });

                        // 4. Update Saldo User & Masa Aktif
                        const userRef = db.collection('USERS').doc(txData.id_user);
                        const expiredDate = new Date();
                        expiredDate.setDate(expiredDate.getDate() + 30);

                        batch.update(userRef, {
                            poin_saldo: admin.firestore.FieldValue.increment(poinDidapat),
                            id_paket_aktif: txData.id_paket,
                            expired_at: admin.firestore.Timestamp.fromDate(expiredDate)
                        });

                        await batch.commit();
                        console.log(`SUKSES: User ${txData.id_user} menerima ${poinDidapat} poin.`);
                    }
                }
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send('Error');
    }
});

module.exports = app;