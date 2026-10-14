import anthropic
from dotenv import load_dotenv

load_dotenv()
client = anthropic.Anthropic()
MODEL = "claude-sonnet-5-5"

LONG_TEXT = open("report.md", encoding="utf-8").read()  # phải > ngưỡng token tối thiểu


def ask(question):
    resp = client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[
            {
                "role": "user",
                "content": [
                    {  # phần dài, không đổi -> có breakpoint
                        "type": "text",
                        "text": LONG_TEXT,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {  # phần đổi, nằm SAU breakpoint
                        "type": "text",
                        "text": question,
                    },
                ],
            }
        ],
    )
    u = resp.usage
    print(
        f"write={u.cache_creation_input_tokens}  "
        f"read={u.cache_read_input_tokens}  "
        f"uncached={u.input_tokens}"
    )
    return resp


ask("Tóm tắt tài liệu này")  # lần 1: write > 0, read = 0
ask("Liệt kê 3 từ khóa")  # lần 2: write = 0, read > 0
