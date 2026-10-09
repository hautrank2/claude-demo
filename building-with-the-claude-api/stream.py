from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic

client = Anthropic()
model = "claude-sonnet-4-6"

messages = [{"role": "user", "content": "Describe Philippines nation"}]

with client.messages.stream(model=model, max_tokens=1000, messages=messages) as stream:
    for text in stream.text_stream:
        print(text, end="")
    final_message = stream.get_final_message()
