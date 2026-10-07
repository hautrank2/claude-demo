import json

import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city, e.g. New York City.
    """
    return json.dumps({"city": city, "temperature": 72, "condition": "Sunny"})

def run():
    runner = client.beta.messages.tool_runner(
        model="claude-sonnet-5",
        max_tokens=1024,
        tools=[get_weather],
        messages=[
            {"role": "user", "content": "Get the weather for New York City."}
        ]
    )

    final_message = runner.until_done()

    for block in final_message.content:
        if block.type == "text":
            print(block.text, end="", flush=True)

if __name__ == "__main__":
    run()
