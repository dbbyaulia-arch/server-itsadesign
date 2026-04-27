const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

app.post('/moota-webhook', async (req, res) => {
    try {
        const mootaSignature = req.headers['authorization'];
        if (mootaSignature !== process.env.MOOTA_SECRET_TOKEN) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const mutasiMasuk = req.body; 

        for (const mutasi of mutasiMasuk) {
            if (mutasi.type === 'CR') {
                const nominal = parseInt(mutasi.amount);

                // 1. CARI TRANSAKSI PENDING
                const txQuery = await db.collection('TRANSAKSI_PEMBAYARAN')
                    .where('total_bayar', '==', nominal)
                    .where('status', '==', 'PENDING')
                    .limit(1)
                    .get();

                if (!txQuery.empty) {
                    const txDoc = txQuery.docs[0];
                    const txData = txDoc.data();

                    // 2. KONSULTASI KE MASTER DATA (PAKET_LANGGANAN)
                    const paketDoc = await db.collection('PAKET_LANGGANAN').doc(txData.id_paket).get();
                    
                    if (paketDoc.exists) {
                        const dataPaket = paketDoc.data();
                        const batch = db.batch();

                        // 3. UPDATE TRANSAKSI
                        batch.update(txDoc.ref, { 
                            status: 'SUCCESS', 
                            paid_at: admin.firestore.FieldValue.serverTimestamp(),
                            catatan_bank: mutasi.description 
                        });

                        // 4. UPDATE DATA USER (POIN & EXPIRED)
                        const userRef = db.collection('USERS').doc(txData.id_user);
                        const tglExpired = new Date();
                        tglExpired.setDate(tglExpired.getDate() + 30);

                        batch.update(userRef, {
                            poin_saldo: admin.firestore.FieldValue.increment(dataPaket.poin_didapat),
                            id_paket_aktif: txData.id_paket,
                            expired_at: admin.firestore.Timestamp.fromDate(tglExpired)
                        });

                        await batch.commit();
                        console.log(`[OK] Payment ${nominal} processed for ${txData.id_user}`);
                    }
                }
            }
        }
        res.status(200).send('Webhook Processed Successfully');
    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = app;