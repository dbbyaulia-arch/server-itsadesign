const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// 1. Inisialisasi Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

// Rute untuk cek status Vercel / Moota
app.get('/', (req, res) => res.status(200).send('Server itsadesign: Webhook Handler Aktif.'));
app.get('/moota-webhook', (req, res) => res.status(200).send('Webhook Endpoint Ready'));

// 2. Endpoint Utama Pembayaran
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

                // Cari tagihan PENDING
                const txQuery = await db.collection('TRANSAKSI_PEMBAYARAN')
                    .where('total_bayar', '==', nominal)
                    .where('status', '==', 'PENDING')
                    .limit(1).get();

                if (!txQuery.empty) {
                    const txDoc = txQuery.docs[0];
                    const txData = txDoc.data();

                    // Ambil bonus Poin dari paket
                    const paketDoc = await db.collection('PAKET_LANGGANAN').doc(txData.id_paket).get();
                    
                    if (paketDoc.exists) {
                        const poinDidapat = paketDoc.data().poin_didapat;
                        const batch = db.batch();

                        // Update Transaksi -> SUCCESS
                        batch.update(txDoc.ref, { 
                            status: 'SUCCESS', 
                            paid_at: admin.firestore.FieldValue.serverTimestamp() 
                        });

                        // Tambah Saldo Poin & Perpanjang 30 Hari
                        const userRef = db.collection('USERS').doc(txData.id_user);
                        const expiredDate = new Date();
                        expiredDate.setDate(expiredDate.getDate() + 30);

                        batch.update(userRef, {
                            poin_saldo: admin.firestore.FieldValue.increment(poinDidapat),
                            id_paket_aktif: txData.id_paket,
                            expired_at: admin.firestore.Timestamp.fromDate(expiredDate)
                        });

                        await batch.commit();
                        console.log(`SUKSES: Poin ${poinDidapat} masuk ke akun ${txData.id_user}`);
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