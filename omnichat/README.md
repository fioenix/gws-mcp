# YODY OmniChat

**Nền tảng chat tập trung đa kênh** với **AI Sales & Customer Service Agents** và **human-in-the-loop**, hợp nhất 4 kênh:

- 🔵 **Facebook Messenger**
- 🟣 **Instagram Direct**
- 🔷 **Zalo OA** (Official Account)
- 🔹 **Zalo PA** (Personal Account)

Một hộp thư duy nhất cho toàn bộ hội thoại khách hàng. AI tự động tư vấn bán hàng & CSKH, tự nhận biết khi cần và **chuyển cho nhân viên (handoff)**; nhân viên có thể tiếp quản bất cứ lúc nào, dùng AI để **gợi ý câu trả lời** rồi duyệt/chỉnh trước khi gửi.

> Giao diện hiện đại, bo tròn mềm mại, xây trên **Shadcn UI** + Tailwind, theo nhận diện thương hiệu YODY (`#2a2b86` / `#fcaf16`, font Be Vietnam Pro).

---

## Tính năng chính

| Nhóm | Mô tả |
| --- | --- |
| **Hộp thư hợp nhất** | Gộp hội thoại từ Facebook, Instagram, Zalo OA, Zalo PA vào một danh sách; lọc theo kênh, trạng thái; tìm kiếm; badge chưa đọc; chỉ báo cảm xúc. |
| **AI Agent tự động** | YODY AI trả lời khách theo persona bán hàng & CSKH, kèm độ tin cậy cho mỗi câu trả lời. |
| **Human-in-the-loop** | Công tắc AI ↔ Nhân viên cho từng hội thoại; nút "Gợi ý AI" sinh bản nháp để nhân viên duyệt; tiếp quản / trả lại cho AI. |
| **Tự động handoff** | Khi phát hiện khiếu nại, yêu cầu hoàn tiền, hoặc độ tin cậy thấp, AI chuyển hội thoại cho nhân viên và ghi log hệ thống. |
| **Hồ sơ khách hàng** | Panel thông tin khách (liên hệ, khu vực theo cấu trúc 34 tỉnh, số đơn, giá trị trọn đời) + insight & hành động AI đề xuất. |
| **Webhook đa kênh** | Endpoint nhận sự kiện inbound chuẩn hóa cho từng kênh (kèm khung xác thực chữ ký). |

## Công nghệ

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** + **Shadcn UI** (Radix primitives) + lucide-react
- API routes (route handlers) + kho dữ liệu in-memory (demo)
- Lớp tích hợp AI định tuyến qua **AI Gateway của YODY**

## Bắt đầu

```bash
cd omnichat
npm install
cp .env.example .env.local   # điền cấu hình (xem bên dưới)
npm run dev                  # http://localhost:3000
```

Bản demo **chạy được ngay** mà không cần cấu hình gì: khi chưa có AI Gateway,
hệ thống dùng bộ trả lời heuristic nội bộ (không gửi dữ liệu ra ngoài). Dùng nút
**"Giả lập tin nhắn từ khách"** trong khung chat để thử luồng AI tự trả lời và
handoff.

## Cấu hình AI (chính sách YODY)

> ⚠️ **Bắt buộc:** mọi lời gọi LLM phải đi qua **AI Gateway của YODY** — không
> gọi thẳng nhà cung cấp ("shadow LLM"). Credentials chỉ đọc từ biến môi trường
> phía server, **không hardcode**.

```env
YODY_AI_GATEWAY_URL=   # endpoint tương thích OpenAI Chat Completions
YODY_AI_GATEWAY_KEY=
YODY_AI_MODEL=yody-cs-agent
```

Khi cấu hình đầy đủ, `lib/ai.ts` sẽ gọi gateway; ngược lại tự fallback heuristic.

## Cấu trúc thư mục

```
omnichat/
├── app/
│   ├── api/
│   │   ├── agents/
│   │   ├── conversations/[id]/{messages,ai-reply,mode,status}/
│   │   └── webhooks/[channel]/
│   ├── layout.tsx        # font Be Vietnam Pro, metadata
│   └── page.tsx          # render InboxWorkspace
├── components/
│   ├── ui/               # Shadcn primitives (button, card, avatar, …)
│   ├── app-sidebar.tsx
│   ├── conversation-list.tsx
│   ├── conversation-view.tsx   # thread + composer + AI assist
│   ├── customer-panel.tsx
│   └── inbox-workspace.tsx     # điều phối state
└── lib/
    ├── ai.ts             # tích hợp AI Gateway + handoff logic
    ├── channels.ts       # metadata 4 kênh
    ├── store.ts          # kho dữ liệu in-memory (demo)
    ├── seed.ts           # dữ liệu mẫu
    └── types.ts
```

## API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `GET` | `/api/conversations` | Danh sách hội thoại |
| `GET` | `/api/conversations/:id/messages` | Tin nhắn của hội thoại |
| `POST` | `/api/conversations/:id/messages` | Gửi tin (nhân viên / khách) |
| `POST` | `/api/conversations/:id/ai-reply` | Sinh trả lời AI (`mode: send\|draft`) |
| `POST` | `/api/conversations/:id/mode` | Chuyển AI ↔ nhân viên |
| `POST` | `/api/conversations/:id/status` | Đổi trạng thái |
| `GET`/`POST` | `/api/webhooks/:channel` | Verify & nhận sự kiện inbound |

## Lên production (cần làm thêm)

Bản demo dùng kho in-memory và chưa ký/giải mã webhook. Trước khi triển khai:

1. Thay `lib/store.ts` bằng CSDL bền vững (Postgres/Prisma) + message broker.
2. Hoàn thiện xác thực chữ ký webhook trong `app/api/webhooks/[channel]/route.ts`
   (Meta `X-Hub-Signature-256`, Zalo OA `mac`, …) cùng đội bảo mật.
3. Thêm xác thực/phân quyền nhân viên (SSO) và audit trail đầy đủ.
4. Kết nối AI Gateway của YODY và cấu hình Use Case theo AI Governance Policy.

---

_Dự án nội bộ YODY. Tài liệu/UX chưa qua kiểm duyệt phòng chức năng — bản nháp._
