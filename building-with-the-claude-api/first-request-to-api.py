from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic

client = Anthropic()
model = "claude-sonnet-4-6"


def chat(content: str, system: str | None = None):
    params = {
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": content}],
    }

    if system:
        params["system"] = system

    message = client.messages.create(**params)
    return message.content[0].text

system = """
You are a patient math tutor.
Do not directly answer a student's questions.
Guide them to a solution step by step.
"""

answer = chat(
    "How do I solve 5x + 2 = 3 for x ?",
    system,
)

print("Answer:", answer)
