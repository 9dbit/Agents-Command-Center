# AI Organization Command Center — UI Blueprint V1
Tanggal: 17 Oktober 2026
Status: DESIGN ONLY / FRONTEND PREVIEW. Tidak ada engine agent, transaksi, approval nyata, atau integrasi produksi yang diaktifkan.

## 1. Keputusan Produk
- Gunakan repository existing `9dbit/Agents-Command-Center`.
- Pertahankan stack UI Vite + React + TypeScript; rapikan komponen dulu, jangan migrasi framework tanpa kebutuhan.
- Pisahkan branch desain dari `main` agar sistem yang ada tidak terganggu.
- Fokus pada pengalaman Owner yang mengawasi satu Supervisor, enam Division Leaders, dan 22 Specialist Agent Roles.
- Semua permintaan Owner masuk melalui AI Supervisor. Supervisor mendelegasikan hanya kepada Division Leader, dan Leader kepada Specialist Agent. Tidak ada UI yang memperkenankan Owner memberi instruksi operasional langsung kepada Specialist Agent.
- Untuk fase ini gunakan data simulasi dengan label mencolok `DEMO DATA / NOT LIVE`, tanpa angka live palsu.

## 2. Audit Ringkas UI Lama (berdasarkan file di main)
Ditemukan:
- `src/App.tsx`: sidebar, Headquarters, Departments, Missions, Brain, Approvals, Tools, Activity; UI departemen plus chat leader, agent floor, task board.
- `src/redesign.css`, `src/p03.css`, `src/mobile.css`: CSS beberapa fase redesign yang perlu disederhanakan agar konsisten.
- `server/index.ts`: fallback/seed untuk Marketing, Sales, Operations, Finance, Engineering, Customer serta status aktivitas tiruan.
- Polling UI sekitar 5 detik; bukan event-stream realtime.
- Tidak terlihat layar khusus Workflows yang menampilkan task tree + detail setiap execution step.
Masalah relatif terhadap charter terbaru:
1) enam divisi tidak sama dengan blueprint organisasi sekarang;
2) halaman awal default memilih departemen, bukan overview Owner;
3) Owner berinteraksi langsung lewat chat leader, berpotensi melewati jalur komando;
4) indikasi `System live` dan fallback `working` dari data demo berisiko menyesatkan;
5) pemisahan Tasks vs Workflows belum jelas.

## 3. Information Architecture — 6 menu primer
1. **Overview**: kondisi organisasi, KPI ringkas, tiga prioritas utama, task aktif, approval masuk, panel Ask AI Supervisor.
2. **Organization**: org map `Owner > Supervisor > 6 Leaders > 22 Roles`, status agent, drilldown profil, pemilik pekerjaan, relasi atasan.
3. **Workflows**: lintasan tugas dari Supervisor ke Leader sampai Specialist; task tree, tahapan, live activity events (simulasi di UI V1), durasi dan blocker.
4. **Tasks**: seluruh pekerjaan dengan filter divisi, owner, status, prioritas; table/board toggle; riwayat dan tautan ke workflow.
5. **Approvals**: inbox L2/L3/L4, detail tindakan, impact, evidence, versi parameter, masa berlaku; aksi demo tidak mengesahkan tindakan nyata.
6. **Activity**: timeline audit terfilter dan mudah ditelusuri berdasarkan task, actor, division, request ID.
Sekunder di Settings: Organization Brain, Tool Registry, Agent Config, Billing/Cost, serta legacy Missions jika tetap diperlukan.

## 4. Organization Map V1
- 01 Customer Support: Inbound, Resolution, Escalation (3).
- 02 Finance Transactions: Deposit, Withdrawal, Transaction Monitoring (3).
- 03 Finance Reconciliation: Gateway Reconciliation, Bank Settlement, Discrepancy, Daily Closing (4).
- 04 Digital Marketing: Campaign, Clipper, Repost, Buzzer Operations (4).
- 05 CRM: Lead Qualification, Segmentation, Follow-Up (3).
- 06 SEO: Keyword Research, Content, Technical SEO, Distribution, Analytics (5).
Jumlah: 1 Supervisor + 6 Leaders + 22 Specialist Roles = 29 identities.
Catatan: angka tersebut identitas di registry target, bukan 29 proses AI selalu berjalan.

## 5. Layout Desktop
```
HEADER  AI ORGANIZATION           [DEMO / NOT LIVE] [Alerts] [Profile]
LEFT NAV       MAIN CONTENT AREA                            ATTENTION RAIL
Overview       CEO Summary / Key Metrics                     Approvals (pending)
Organization   Org Map / Task Tree / Task Board               Alerts and Blockers
Workflows      Current Selection and Drilldown                Last Verified Events
Tasks
Approvals      ---------------------------------------------------------
Activity       [ Ask AI Supervisor…                                       ]
```
- Sidebar ramping; panel kanan hanya saat ada perhatian penting, bukan permanen di semua ukuran.
- Tindakan chat hanya menuju Supervisor; direct agent chat tidak tersedia bagi Owner.
- Pilih agent membuka drawer: identity, reports-to, charter, capabilities, current tasks, activity, limitations.
- Pilih task membuka Task Detail: header, owner, priority, risk, current state, evidence, event history, parent-child links.

## 6. Layout Mobile
- Satu kolom; ringkasan ke atas, approval dan blockers mudah dicapai.
- Floating pill navigation, panel lain sebagai bottom sheet/drawer.
- Organization Map berlapis: Owner > Supervisor > leader dipilih > daftar Specialist.
- Workflow viewer berbentuk step timeline vertikal; diagram penuh tetap tersedia via expand.
- Sticky Ask Supervisor composer; jangan menutup area konten/approval.
- Jangan mengandalkan hover untuk aksi atau makna status.

## 7. Komponen Prioritas
- `AppShell`, `PrimaryNav`, `TopStatus`, `SupervisorComposer`
- `MetricStrip`, `NeedsAttention`, `DivisionSnapshot`
- `OrgTree`, `AgentDetailDrawer`, `AgentStatusIndicator`
- `WorkflowExplorer`, `TaskTree`, `WorkflowStepTimeline`
- `TaskTable`, `KanbanBoard`, `TaskDetailDrawer`
- `ApprovalInbox`, `ApprovalDetail`, `AuditTimeline`
- `DemoDataProvider` untuk mode UI-preview terpisah dari adapter API nantinya.

## 8. Design System
- Dark first: background near-black, typography putih/abu-abu, accent oranye hanya untuk CTA atau prioritas penting.
- Minim card bertumpuk; separators tipis, ruang kosong luas, hierarki teks bersih.
- Floating pill frosted glass untuk navigasi; interaksi halus tanpa animasi berlebihan.
- Status Working/Idle/Waiting/Blocked/Paused/Failed/Completed harus dapat dibedakan lewat label + bentuk/ikon, bukan warna saja.
- Badge `DEMO DATA` tampil konsisten. Tidak boleh menunjukkan `LIVE`, angka aktivitas aktual, atau `connected` tanpa bukti.
- Tipe relatif besar/cukup kontras pada ponsel.

## 9. User Flows Prototype
Flow A: Owner membuka Overview -> memilih Finance Reconciliation -> melihat Leader dan empat agent -> membuka agent -> melihat detail task -> Watch Workflow -> membaca step timeline dan evidence.
Flow B: Owner membuka Approvals -> memilih request L4 -> melihat siapa meminta, nominal/tujuan [masked], kontrol dua-pihak -> action buttons mode demo, tanpa eksekusi nyata.
Flow C: Owner mengetik di Supervisor composer -> layar menampilkan `Draft request (demo)` dan visualisasi `Supervisor -> Leader -> Specialist`, tanpa membuat job produksi.
Flow D: Filter Tasks berdasarkan agent, status, prioritas -> pilih task -> lihat parent task + status perubahan.

## 10. Acceptance Criteria UI-Only
- Keenam divisi dan 29 identitas sesuai charter, tidak ada divisi contoh lama.
- Overview sebagai landing page, bukan department.
- Tersedia enam menu primer dan navigation state yang berfungsi.
- Organization drilldown dan Workflow drilldown dapat diklik dengan dummy data konsisten.
- Approvals memperlihatkan requirement level risiko; tidak memberi kesan approval produksi.
- Seluruh angka dan aktivitas tiruan diberi label DEMO.
- Responsif di desktop dan iPhone, tanpa horizontal scroll utama.
- Tidak ada perubahan pada database, payment gateway, domain, atau service produksi selama fase UI-preview.
- UI dapat dibangun serta lulus typecheck secara lokal sebelum diusulkan untuk merge.

## 11. Urutan Pengerjaan UI
1. Inventory & clean-up komponen UI lama tanpa mengubah backend.
2. Ubah taksonomi enam divisi dan data contoh.
3. Rebuild app shell, Overview, dan Supervisor composer.
4. Organization Map + Agent Drawer.
5. Workflows Explorer + Timeline dan tugas terkait.
6. Tasks, Approvals, Activity diselaraskan.
7. Mobile QA, status demo, accessibility QA, screenshot pembanding.
8. Review Owner. Baru kemudian putuskan integrasi engine.

## 12. Yang Belum Dikerjakan
- Belum ada modifikasi UI source code, deployment atau koneksi agent pada branch ini.
- Ini dokumen blueprint untuk review, bukan klaim implementasi.
