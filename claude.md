Tool use with Claude
Claude is capable of interacting with external client-side tools and functions, allowing you to equip Claude with your own custom tools to perform a wider variety of tasks.

Learn everything you need to master tool use with Claude via our new comprehensive tool use course! Please continue to share your ideas and suggestions using this form.

Here’s an example of how to provide tools to Claude using the Messages API:


Shell

Python

curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-7-sonnet-20250219",
    "max_tokens": 1024,
    "tools": [
      {
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "input_schema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state, e.g. San Francisco, CA"
            }
          },
          "required": ["location"]
        }
      }
    ],
    "messages": [
      {
        "role": "user",
        "content": "What is the weather like in San Francisco?"
      }
    ]
  }'
​
How tool use works
Integrate external tools with Claude in these steps:

1
Provide Claude with tools and a user prompt

Define tools with names, descriptions, and input schemas in your API request.
Include a user prompt that might require these tools, e.g., “What’s the weather in San Francisco?”
2
Claude decides to use a tool

Claude assesses if any tools can help with the user’s query.
If yes, Claude constructs a properly formatted tool use request.
The API response has a stop_reason of tool_use, signaling Claude’s intent.
3
Extract tool input, run code, and return results

On your end, extract the tool name and input from Claude’s request.
Execute the actual tool code client-side.
Continue the conversation with a new user message containing a tool_result content block.
4
Claude uses tool result to formulate a response

Claude analyzes the tool results to craft its final response to the original user prompt.
Note: Steps 3 and 4 are optional. For some workflows, Claude’s tool use request (step 2) might be all you need, without sending results back to Claude.

Tools are user-provided

It’s important to note that Claude does not have access to any built-in server-side tools. All tools must be explicitly provided by you, the user, in each API request. This gives you full control and flexibility over the tools Claude can use.

The computer use (beta) functionality is an exception - it introduces tools that are provided by Anthropic but implemented by you, the user.

​
How to implement tool use
​
Choosing a model
Generally, use Claude 3.7 Sonnet, Claude 3.5 Sonnet or Claude 3 Opus for complex tools and ambiguous queries; they handle multiple tools better and seek clarification when needed.

Use Claude 3.5 Haiku or Claude 3 Haiku for straightforward tools, but note they may infer missing parameters.

If using Claude 3.7 Sonnet with tool use and extended thinking, refer to our guide here for more information.
​
Specifying tools
Tools are specified in the tools top-level parameter of the API request. Each tool definition includes:

Parameter	Description
name	The name of the tool. Must match the regex ^[a-zA-Z0-9_-]{1,64}$.
description	A detailed plaintext description of what the tool does, when it should be used, and how it behaves.
input_schema	A JSON Schema object defining the expected parameters for the tool.

Example simple tool definition

​
Tool use system prompt
When you call the Anthropic API with the tools parameter, we construct a special system prompt from the tool definitions, tool configuration, and any user-specified system prompt. The constructed prompt is designed to instruct the model to use the specified tool(s) and provide the necessary context for the tool to operate properly:


In this environment you have access to a set of tools you can use to answer the user's question.
{{ FORMATTING INSTRUCTIONS }}
String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.
Here are the functions available in JSONSchema format:
{{ TOOL DEFINITIONS IN JSON SCHEMA }}
{{ USER SYSTEM PROMPT }}
{{ TOOL CONFIGURATION }}
​
Best practices for tool definitions
To get the best performance out of Claude when using tools, follow these guidelines:

Provide extremely detailed descriptions. This is by far the most important factor in tool performance. Your descriptions should explain every detail about the tool, including:
What the tool does
When it should be used (and when it shouldn’t)
What each parameter means and how it affects the tool’s behavior
Any important caveats or limitations, such as what information the tool does not return if the tool name is unclear. The more context you can give Claude about your tools, the better it will be at deciding when and how to use them. Aim for at least 3-4 sentences per tool description, more if the tool is complex.
Prioritize descriptions over examples. While you can include examples of how to use a tool in its description or in the accompanying prompt, this is less important than having a clear and comprehensive explanation of the tool’s purpose and parameters. Only add examples after you’ve fully fleshed out the description.

Example of a good tool description


Example poor tool description

The good description clearly explains what the tool does, when to use it, what data it returns, and what the ticker parameter means. The poor description is too brief and leaves Claude with many open questions about the tool’s behavior and usage.

​
Controlling Claude’s output
​
Forcing tool use
In some cases, you may want Claude to use a specific tool to answer the user’s question, even if Claude thinks it can provide an answer without using a tool. You can do this by specifying the tool in the tool_choice field like so:


tool_choice = {"type": "tool", "name": "get_weather"}
When working with the tool_choice parameter, we have four possible options:

auto allows Claude to decide whether to call any provided tools or not. This is the default value when tools are provided.
any tells Claude that it must use one of the provided tools, but doesn’t force a particular tool.
tool allows us to force Claude to always use a particular tool.
none prevents Claude from using any tools. This is the default value when no tools are provided.
This diagram illustrates how each option works:


Note that when you have tool_choice as any or tool, we will prefill the assistant message to force a tool to be used. This means that the models will not emit a chain-of-thought text content block before tool_use content blocks, even if explicitly asked to do so.

Our testing has shown that this should not reduce performance. If you would like to keep chain-of-thought (particularly with Opus) while still requesting that the model use a specific tool, you can use {"type": "auto"} for tool_choice (the default) and add explicit instructions in a user message. For example: What's the weather like in London? Use the get_weather tool in your response.

​
JSON output
Tools do not necessarily need to be client-side functions — you can use tools anytime you want the model to return JSON output that follows a provided schema. For example, you might use a record_summary tool with a particular schema. See tool use examples for a full working example.

​
Chain of thought
When using tools, Claude will often show its “chain of thought”, i.e. the step-by-step reasoning it uses to break down the problem and decide which tools to use. The Claude 3 Opus model will do this if tool_choice is set to auto (this is the default value, see Forcing tool use), and Sonnet and Haiku can be prompted into doing it.

For example, given the prompt “What’s the weather like in San Francisco right now, and what time is it there?”, Claude might respond with:

JSON

{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "<thinking>To answer this question, I will: 1. Use the get_weather tool to get the current weather in San Francisco. 2. Use the get_time tool to get the current time in the America/Los_Angeles timezone, which covers San Francisco, CA.</thinking>"
    },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "get_weather",
      "input": {"location": "San Francisco, CA"}
    }
  ]
}
This chain of thought gives insight into Claude’s reasoning process and can help you debug unexpected behavior.

With the Claude 3 Sonnet model, chain of thought is less common by default, but you can prompt Claude to show its reasoning by adding something like "Before answering, explain your reasoning step-by-step in tags." to the user message or system prompt.

It’s important to note that while the <thinking> tags are a common convention Claude uses to denote its chain of thought, the exact format (such as what this XML tag is named) may change over time. Your code should treat the chain of thought like any other assistant-generated text, and not rely on the presence or specific formatting of the <thinking> tags.

​
Parallel tool use
By default, Claude may use multiple tools to answer a user query. You can disable this behavior by setting disable_parallel_tool_use=true in the tool_choice field.

When tool_choice type is auto, this ensures that Claude uses at most one tool
When tool_choice type is any or tool, this ensures that Claude uses exactly one tool
Parallel tool use with Claude 3.7 Sonnet

Claude 3.7 Sonnet may be less likely to make make parallel tool calls in a response, even when you have not set disable_parallel_tool_use. To work around this, we recommend enabling token-efficient tool use, which helps encourage Claude to use parallel tools.

If you prefer not to opt into the token-efficient tool use beta, you can also introduce a “batch tool” that can act as a meta-tool to wrap invocations to other tools simultaneously. We find that if this tool is present, the model will use it to simultaneously call multiple tools in parallel for you.

See this example in our cookbook for how to use this workaround.

​
Handling tool use and tool result content blocks
When Claude decides to use one of the tools you’ve provided, it will return a response with a stop_reason of tool_use and one or more tool_use content blocks in the API response that include:

id: A unique identifier for this particular tool use block. This will be used to match up the tool results later.
name: The name of the tool being used.
input: An object containing the input being passed to the tool, conforming to the tool’s input_schema.

Example API response with a `tool_use` content block

When you receive a tool use response, you should:

Extract the name, id, and input from the tool_use block.
Run the actual tool in your codebase corresponding to that tool name, passing in the tool input.
Continue the conversation by sending a new message with the role of user, and a content block containing the tool_result type and the following information:
tool_use_id: The id of the tool use request this is a result for.
content: The result of the tool, as a string (e.g. "content": "15 degrees") or list of nested content blocks (e.g. "content": [{"type": "text", "text": "15 degrees"}]). These content blocks can use the text or image types.
is_error (optional): Set to true if the tool execution resulted in an error.

Example of successful tool result

JSON

{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "15 degrees"
    }
  ]
}

Example of tool result with images

JSON

{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": [
        {"type": "text", "text": "15 degrees"},
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRg...",
          }
        }
      ]
    }
  ]
}

Example of empty tool result

JSON

{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
    }
  ]
}
After receiving the tool result, Claude will use that information to continue generating a response to the original user prompt.

Differences from other APIs

Unlike APIs that separate tool use or use special roles like tool or function, Anthropic’s API integrates tools directly into the user and assistant message structure.

Messages contain arrays of text, image, tool_use, and tool_result blocks. user messages include client-side content and tool_result, whileummm what did u assistant messages contain AI-generated content and tool_use.