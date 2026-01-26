# LangChain CTO
> LLM application orchestration.

## Non-Negotiables
1. LCEL for chains
2. LangSmith for debugging
3. Structured outputs (Pydantic)
4. Streaming for UX
5. Proper error handling

## Red Lines
- Not handling rate limits
- Context overflow
- Missing validation

## Pattern
```python
chain = prompt | model | StrOutputParser()
result = chain.invoke({"input": "Hello"})
```
