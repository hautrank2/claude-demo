import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()
client = anthropic.Anthropic()
MODEL = "claude-opus-5-5"
TOOLS = [{"type": "code_execution_20260521", "name": "code_execution"}]  # server tool -> Claude tự chạy code
OUTPUT_DIR = Path("outputs")


# 1. Files API: upload 1 lần -> nhận file_id, dùng lại được ở nhiều request
uploaded = client.files.upload(file=Path("sales.csv"))
print(f"Uploaded: {uploaded.id} ({uploaded.size_bytes} bytes)")


def run(messages, container_id=None):
    """Gọi API, tự resume khi gặp pause_turn (turn chạy code lâu bị tạm dừng)."""
    while True:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=16000,
            tools=TOOLS,
            messages=messages,
            **({"container": container_id} if container_id else {}),
        )
        messages.append({"role": "assistant", "content": resp.content})
        container_id = resp.container.id  # giữ container để resume / hỏi tiếp
        if resp.stop_reason != "pause_turn":
            return resp


def show(resp):
    """In text + output của từng lần chạy code; trả về file_id các file Claude tạo ra."""
    file_ids = []
    for block in resp.content:
        if block.type == "text":
            print(block.text)
        elif block.type == "server_tool_use":
            print(f"\n[Claude chạy code] {block.input}")
        elif block.type == "bash_code_execution_tool_result":
            result = block.content
            if result.type != "bash_code_execution_result":  # lỗi tool -> không raise, nằm trong content
                print(f"[lỗi] {result.error_code}")
                continue
            if result.stdout:
                print(f"[stdout]\n{result.stdout}")
            if result.stderr:
                print(f"[stderr]\n{result.stderr}")
            file_ids += [f.file_id for f in result.content]  # file mới tạo trong container
    return file_ids


def download(file_ids):
    """Files API: tải các file do code execution sinh ra về máy."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    for file_id in file_ids:
        meta = client.files.retrieve_metadata(file_id)
        name = os.path.basename(meta.filename)  # chặn path traversal
        if not name or name in (".", ".."):
            continue
        client.files.download(file_id).write_to_file(OUTPUT_DIR / name)
        print(f"Saved: {OUTPUT_DIR / name}")


# 2. Đưa file vào container bằng block container_upload, Claude viết + chạy Python để phân tích
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "Phân tích file sales.csv: tổng doanh thu theo region và product, "
                "xu hướng theo tháng. Vẽ biểu đồ line doanh thu theo tháng cho từng "
                "region, lưu thành revenue_by_month.png.",
            },
            {"type": "container_upload", "file_id": uploaded.id},
        ],
    }
]
resp = run(messages)
download(show(resp))

# 3. Hỏi tiếp trong CÙNG container: file + biến từ lần trước vẫn còn
messages.append(
    {
        "role": "user",
        "content": "Dự đoán doanh thu tháng 2026-07 cho từng region bằng linear regression, "
        "xuất kết quả ra forecast.csv.",
    }
)
resp = run(messages, container_id=resp.container.id)
download(show(resp))

# 4. Dọn dẹp file đã upload (file lưu vĩnh viễn đến khi xóa)
client.files.delete(uploaded.id)
print(f"\nDeleted: {uploaded.id}")
