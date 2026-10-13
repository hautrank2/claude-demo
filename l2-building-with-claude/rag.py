import re
from dotenv import load_dotenv
import anthropic
import numpy as np
import voyageai

load_dotenv()
voyage = voyageai.Client()
claude = anthropic.Anthropic()
model = "claude-haiku-5-5"


def chunk_by_section(document_text):
    pattern = r"\n## "
    return re.split(pattern, document_text)


def generate_embeddings(texts, input_type, model="voyage-3-large"):
    result = voyage.embed(texts, model=model, input_type=input_type)
    return np.array(result.embeddings)


def search(question, chunks, chunk_embeddings, k=2):
    question_embedding = generate_embeddings([question], input_type="query")[0]
    # Voyage embeddings have length 1, so the dot product is the cosine similarity
    similarities = chunk_embeddings @ question_embedding
    top = np.argsort(similarities)[::-1][:k]
    return [(chunks[i], similarities[i]) for i in top]


def answer(question, context):
    prompt = f"""Answer the question using only the context below.
    <context>
    {context}
    </context>
    Question: {question}"""
    message = claude.messages.create(
        model=model,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in message.content if block.type == "text")


# 1. Chunk the document
with open("./report.md", encoding="utf-8") as f:
    text = f.read()
chunks = chunk_by_section(text)
print(chunks[2])
# 2 + 3. Embed every chunk and keep the vectors in memory (our "vector database")
chunk_embeddings = generate_embeddings(chunks, input_type="document")

# 4 + 5. Embed the question and find the most similar chunks
question = "What caused incident INC-2025-0417 and how did it affect support tickets?"
results = search(question, chunks, chunk_embeddings)
for chunk, similarity in results:
    print(f"{similarity:.3f}  {chunk.splitlines()[0]}")

# 6 + 7. Put the chunks in a prompt and ask Claude
context = "\n\n".join(chunk for chunk, _ in results)
print(answer(question, context))
