# 🚪 CỔNG CHÀO AI — hue-dhcl (tri thức kỹ thuật)

> Điểm vào kỹ thuật cho mọi AI (CTO AI, Antigravity, Claude Code). Quy trình/governance ở
> `/README_AI.md` + `docs/01_GOVERNANCE/`; thư mục `docs/ai/` này = tri thức kỹ thuật.
> Đọc đúng thứ tự bên dưới — KHÔNG đọc tràn lan cả repo.

## Danh mục
| File | Nội dung | Ai được sửa |
|------|----------|------|
| [00_SNAPSHOT.md](00_SNAPSHOT.md) | Trạng thái HIỆN TẠI (stack, chức năng, quy tắc, rủi ro) | Dev AI (sửa đúng chỗ, không tường thuật) |
| [01_ROLES.md](01_ROLES.md) | Phân vai PO / CTO AI / Dev AI | **Chỉ PO** |
| [02_WORKFLOW.md](02_WORKFLOW.md) | Vòng làm việc, mẫu báo cáo, quy tắc Git & bí mật | **Chỉ PO** |
| [03_ARCHITECTURE_MAP.md](03_ARCHITECTURE_MAP.md) | Bản đồ file, bảng, route, màn hình | Dev AI |
| [04_DECISIONS.md](04_DECISIONS.md) | Quyết định & drift, append-only | Dev AI (chỉ thêm) |
| [05_BACKLOG.md](05_BACKLOG.md) | Việc còn lại | Dev AI / CTO AI |
| [06_DEPLOYMENT.md](06_DEPLOYMENT.md) | Triển khai NAS, bí mật, lọc IP | **Chỉ PO** |
| [CHANGELOG_AI.md](CHANGELOG_AI.md) | Lịch sử từng ticket, mới nhất ở đầu | Dev AI (chỉ thêm ở đầu) |
| [prompts/](prompts/) | Khung prompt cho Antigravity / Claude Code | **Chỉ PO** |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [DEMO_SOFT_UI_TOKENS.md](DEMO_SOFT_UI_TOKENS.md) | Giấy phép theme (BẮT BUỘC giữ), token giao diện | — |

## Ngân sách đọc
- **Mọi task**: file này + `00_SNAPSHOT.md`.
- Cần chi tiết route/bảng/field → `03_ARCHITECTURE_MAP.md` (chỉ mục liên quan).
- Cần "vì sao" → `grep` trong `04_DECISIONS.md`. Không đọc hết `CHANGELOG_AI.md`.

## Quy tắc khi sửa `docs/ai/`
1. Không viết đè cả file khi "cập nhật" — sửa đúng phần liên quan.
2. Mọi khẳng định về code phải trỏ được `file:dòng`.
3. Không dump code vào báo cáo.
4. `00_SNAPSHOT.md` luôn là trạng thái hiện tại; tường thuật chi tiết chỉ ghi ở `CHANGELOG_AI.md`.
5. Tài liệu/code lệch nhau → ghi `04_DECISIONS.md` mục "Drift phát hiện".
6. Git và bí mật: theo `02_WORKFLOW.md` mục 4–5 và `01_ROLES.md` (Dev AI không commit/push).
