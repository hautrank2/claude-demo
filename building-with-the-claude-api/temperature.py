from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic

client = Anthropic()
model = "claude-sonnet-4-6"


def chat(content: str, temperature=1.0):
    params = {
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": content}],
        "temperature": temperature,
    }

    message = client.messages.create(**params)
    return message.content[0].text


answer = chat(
    "Who will Ballon d'Or this year you predict ?",
    0.1,
)

print("Answer:", answer)
