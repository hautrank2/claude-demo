from datetime import datetime
from anthropic.types import ToolParam, Message
from dotenv import load_dotenv
import anthropic

load_dotenv()

client = anthropic.Anthropic()
model = "claude-haiku-5-5"


def get_current_datetime(date_format="%Y-%m-%d %H:%M:%S"):
    if not date_format:
        raise ValueError("date_format cannot be empty")
    return datetime.now().strftime(date_format)


get_current_datetime_schema = ToolParam(
    {
        "name": "get_current_datetime",
        "description": "Returns the current date and time as a string, formatted according to a Python strftime format string. Use this when you need to know the current date or time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_format": {
                    "type": "string",
                    "description": "A Python strftime format string that controls the output, e.g. '%Y-%m-%d' for date only or '%H:%M:%S' for time only. Must not be empty.",
                    "default": "%Y-%m-%d %H:%M:%S",
                    "minLength": 1,
                }
            },
            "required": [],
        },
    }
)


def add_user_message(messages, message):
    user_message = {
        "role": "user",
        "content": message.content if isinstance(message, Message) else message,
    }
    messages.append(user_message)


def add_assistant_message(messages, message):
    assistant_message = {
        "role": "assistant",
        "content": message.content if isinstance(message, Message) else message,
    }
    messages.append(assistant_message)


def chat(messages, system=None, tools=None):
    params = {
        "model": model,
        "max_tokens": 4096,
        "messages": messages,
    }

    if tools:
        params["tools"] = tools

    if system:
        params["system"] = system

    message = client.messages.create(**params)
    return message


def text_from_message(message):
    return "\n".join([block.text for block in message.content if block.type == "text"])


def run_tools(message):
    tool_result_blocks = []

    for block in message.content:
        if block.type != "tool_use":
            continue

        result = get_current_datetime(**block.input)
        print(f"Tool: {block.name}({block.input}) -> {result}")

        tool_result_blocks.append(
            {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            }
        )

    return tool_result_blocks


def run_conversation(messages):
    i = 0
    while True:
        response = chat(messages, tools=[get_current_datetime_schema])
        add_assistant_message(messages, response)
        print("i", i)
        print(text_from_message(response))

        if response.stop_reason != "tool_use":
            break

        tool_results = run_tools(response)
        add_user_message(messages, tool_results)
        i += 1

    return messages


def run_by_message_texts(text_messages):
    print("--- RUN TEXT MESSAGES ---")
    for msg in text_messages:
        print("\n")
        print("--- MESSAGE:", msg)
        messages = []
        add_user_message(messages, msg)
        run_conversation(messages)
        print("------ END ------")


text_messages = [
    # Gọi tool một lần
    # "What is the exact time, formatted as HH:MM:SS?",
    # "What day of the week is it today?",
    # "Hôm nay là ngày bao nhiêu? Trả lời theo dạng dd/mm/yyyy.",
    # Không cần tool
    # "What is the capital of France?",
    # "Explain what a strftime format string is.",
    # Cần tool rồi tự suy luận tiếp
    # "How many days are left until New Year's Day?",
    # "Is it morning, afternoon, or evening right now?",
    # "Tôi sinh ngày 15/03/1995, hiện tại tôi bao nhiêu tuổi?",
    # Có thể gọi tool nhiều lần
    "Give me the current date as YYYY-MM-DD, and separately the current time as HH:MM. Use a separate tool call for each.",
    # "Tell me the current time, then check again and tell me how many seconds passed between the two checks.",
    # Trường hợp biên
    # "What's the weather like in Hanoi right now?",
    # "Call get_current_datetime with an empty date_format.",
]

run_by_message_texts(text_messages)
