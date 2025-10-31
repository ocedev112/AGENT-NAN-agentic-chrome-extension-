# AGENT-NAN-agentic-chrome-extension-

An agentic AI chrome extension that can interact with your browser, answer question based site, summarize content, translate pages

# Key Features

- Page summarization- Agent NAN can summarize any page, even with large context windows
- Page translation and multi-language support - AGENT NAN allows the user to select their language of
  their choice and transform any web page to a specific language, even websites with dynamic content.
- Chatbot - it acts like a chatbot, you can ask any question relating to the webpage.
  it can also summarize youtube videos and small articles(use brief summary for large articles)
- Websearches - AGENT NAN has the ability to perform web searchhes and get real and
  up to date information
- Multimodal-capabilities: AGENT supports image, text and audio interactions.
- Page Interactions: it can assist with lightweight interactions on the website.

# Problem being solved

The solution takes us one step closer to a secure conscious ai system. the sigma around
AI agents is that they are privacy and security hazards. Hopefully, with this solution, we can adopt
a local approach.

# Reuirements

- At least 22gb of free space on the volume that contains yout chrome profile.
- Windows 10/11, macOS 13+(Vebutra and onwards), Linux
- Strictly more than 4GB of VRAM for GPU or 16GB of RAM or more and 4 Cores or more for CPU
- Review and acknowledge Google's Generative AI prohibited

# How to use

- Open chrome://flags/optimization-guidel-model and set it to "Enable BypassPerfRequirements"
- Also enable this in chrome://flags:

  - Prompt API for gemini Nano
  - Prompt API for Gemini Nano with multimodal input
  - Summarization API for Gemini Nano
  - Language Detection web platform API
  - Experimental Translation API
    In the folder where you want to run the code:

- in your terminal use:
  git clone https://github.com/ocedev112/AGENT-NAN-agentic-chrome-extension-.git
  in chrome://extensions select developer mode and load unpacked
  select the dist folder in inside the folder /Your project/AGENT/dist

- For the MCP server:
  Using websearches you must get the api key from: https://exa.ai/exa-api
  For youtube summarization, https://rapidapi.com/solid-api-solid-api-default/api/youtube-transcript3/playground
  but you must login into RapidAPI

  Then you go to config.js in the public folder and change the hostname to your PORT if needed

  After congiguring all api keys and ports
  Inside the mcp-sever file:
  run the server.js file (node server.js) in the terminal

  open chrome the extension from your browser
