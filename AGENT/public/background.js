let ws = null
let messageId = 0
let pendingRequests = new Map()
let globalSession = null
let isConnected = false
let capturedFile = null
let globalURL = ""
let globalImage = null
let sidePanelActivated = false

let chromeRequest = null
const connectToServer = () => {
    return new Promise((resolve, reject) => {
        ws = new WebSocket('ws://localhost:3000')
        
        const connectionTimeout = setTimeout(() => {
            reject(new Error('Connection timeout'))
            if (ws) ws.close()
        }, 100)

        ws.onopen = () => {
            console.log('WebSocket connected')
            clearTimeout(connectionTimeout)
            isConnected = true
            resolve() // Resolve immediately when connected
        }

        ws.onmessage = (event) => {          
            const msg = JSON.parse(event.data)
            console.log("Received:", msg)
            
            if (msg.id && pendingRequests.has(msg.id)) {
                const { resolve, reject } = pendingRequests.get(msg.id)
                pendingRequests.delete(msg.id)
                
                if (msg.error) {
                    reject(new Error(msg.error.message || 'Unknown error'))
                } else {
                    resolve(msg.result)
                }
            }
        }

        ws.onerror = (error) => {
            console.error('WebSocket error:', error)
            clearTimeout(connectionTimeout)
            reject(error)
        }
        

    })
}

connectToServer()


const sendRequest = (method, params) => {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return reject(new Error('WebSocket is not connected'))
        }
        
        const id = ++messageId
        pendingRequests.set(id, { resolve, reject })
        
        const message = {
            jsonrpc: "2.0",
            id,
            method,
            params
        }
        
        console.log("Sending:", JSON.stringify(message))
        ws.send(JSON.stringify(message))

        

    })
}

let allElements = [];


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  if (message.action === 'elementsFound') {

    allElements = message.elements;
    
    console.log('Received', allElements.length, 'elements from:', message.url);
    console.log('Elements:', allElements);
    

    chrome.storage.local.set({ 
      elements: allElements,
      url: message.url
    });
  }
  
})




console.log("Starting connection...")

let maxInteractions = 5
let interactions = 0
async function interactionLoop(query){
  if(interactions > maxInteractions){
    return
  }
  interactions = interactions + 1
  try{
     const data = await getInteractiveElements(globalURL)
     const limitedData = data.map(({ className, href,...rest }) => rest);
     console.log("interaction loop new data", limitedData)
     const InteractiveDataString = JSON.stringify(limitedData)
     const elements = await globalSession.prompt(`using the HTML object file: "${InteractiveDataString.trim()}, find the 
            ids({id: } in object file) in object most associated with this question:"${query}" and return their ids 
            in order of steps in interaction in this
            Follow this rule:
            -For searching for items, videos, etc or, lookup and insertig values  questions,look for input tags , i,e {tag: "input"} with {type: "text"}, or {type: "search"} ,
            {tag: "textarea"}. and use placeholder and label at for multiple inputs. Do NOT click button next to search, click on the input tag that itself
            -For clicking questions look for {tag: "button"}, {tag: "div"}, {tag: "a"}
            -ALWAYS check text, ariaLabels, and text for click, or touching events from objectFile to decided with id to use, if it matches with the question then pick
            -NEVER return an id with a false tag(critical mistake)
            -If the question requires one action return the single most importand id associated with that action
            -If they are multiple steps return ids in the order of actions to achieve the goal
            -If the query is vague then you can make a decison on which element to pick first based on the image provided
            and object file
            -Use Image to find the position of elements and which elements are more important
            format: (this are examples it must be their actual ids) multiple ids with comma sepertaing them(order of interaction) if multiple, and 1
            one i. ALWAYS seperate ids with commas between them
             if  single
             always CHECK the tag at end and do NOT forget to follow the rule. do NOT use id with bad tag
            `)
      console.log("elements", elements)
      const stepElm = elements.split(',').map(num => parseInt(num.trim()));

      for(let i = 0; i<stepElm.length; i++){
            const elm = data[stepElm[i]]
            console.log("elm", elm)

            const elmClass =  '.' + elm.className.split(' ').join('.');
            const elmTag = elm.tag
           
            await InteractWithElement(globalURL, elmClass, elmTag, query);
            const nextPrompt = await globalSession.prompt( `Based on the image do you need to click something else to perform users request: ${query}, or if you need to go back and you made mistake(hint: click close
            or cancel) based on image.return yes or no only(case sensitive), yes, if you're done and no if you aren't
            .Do NOT return no if the the user's request has not fully been fulfied and if image doesn't indicate it was , add your reason at the
            back of yes and no, and which element you picked, and a description of the image`
             )

            console.log("next prompt", nextPrompt)
            if(nextPrompt.includes("yes")){
               await interactionLoop(query)
               break
            }else{
              continue
            }
     }
     return
  }catch(error){
     console.log("error occured  in interaction loop", error)
  }
}

let promptHistory = []
async function delegatePrompt(request){
   try {
        if(!globalSession){
          const [websiteImage, available] = await Promise.all([
            captureWebsiteAsImage(request.params.arguments.url),
            LanguageModel.availability()
          ]);
          console.log("website image", websiteImage)    
          console.log(available);

           globalSession = await LanguageModel.create({
            initialPrompts: [
              {
               role: "system",
               content:[
                {type: "text", value:`You are a tool picker for an MCP agent and Query generator,Your job
               is return tools and other comphrehensive/short answers
               You are also picking some tools and deciding using this, you will also generate queries and  answer questions
               using this  website image and website context provided to you: "${request.context.slice(0,37000)}"
               . You will read all prompts concisely, and make accurate and quick decisions and you will never return
               an Incomplete/Unspecific/Unclear query. Follow all instructions given to you
               `},
               {type: "image", value: websiteImage}
              ],
              },
             {
               role: "assistant",
               content: `Okay i will decide all prompts effectively, read in a concise manner, and make accurate decisions with tools and
               other prompts and i will not return unspecific/unclear/incomplete queries and follow all instructions`,
           },
         ],
            expectedInputs: [ { type: "text",languages: ["en", "ja" ]},
             { type: 'image' }
        ],
          expectedOutputs: [{ type: "text", languages: ["ja"] }],
          temperature: 0.3,
          topK: 3,
        });

        console.log("session created successfully")
      }
        const toolInstruction =           `You are a tool selection assistant. Based on the user's query: "${request.params.arguments.query}", determine the most appropriate tool from the following list. Return ONLY the tool name, with NO surrounding characters or punctuation, and maintain the specified case.
          ALWAYS check previous prompts to determine, especially if the prompt is unclear
         Tools: 
        Interact: Select this tool if the user is asking/commnading you to interact with the page. It must be 
         a specific interaction Request IN the website like search(search must be website related, e.g search for bag), click, fill, etc.., 
         and it MUST be an INTERACTION request, not a vague one(has to be clear),
          if it is (Return(case sensitive) only: Interact)
        getYoutubeSubtitles: Select this tool if the query requires information derived from 
         YouTube video subtitles. This includes requests for summaries, lyrics, specific phrases, subtext, 
         or any question related to the video's content. Do NOT use this question for things outside the video itself
         like likes, title, youtuber's name, comments etc,it must be specifically related to caption
         .Ensure ${request.params.arguments.videoId} is NOT 
         null before selecting this tool. (Return(case sensitive) only: getYoutubeSubtitles)
        simpleGoogleSearch:Select this tool if the query requires real-time information 
        (e.g., weather, sports scores) or supplementary information not available within the current website context.
        ALWAYS check the website context FIRST to see if the query can be answered without external assistance.
        i.e if the provided text/context doesn't answer the question and you can't answer,  or
        if the user tells you directly to use this tool but if website search interaction request don't use, if you really need factual and real-time information
        (Return(case sensitive) only: simpleGoogleSearch)
        webGoogleSearch: Select this tool if the query requires consulting multiple external 
        websites to arrive at an answer.  ALWAYS check the website context FIRST to see if the query can 
        be answered without the need to search the web. i.e if the provided text/context doesn't answer
        the question and you can't answer it, or of the user tells you directly to use this tool but if website search interaction request don't use, if you really need factual 
        and real-time information (Return(case sensitive) only: webGoogleSearch)
        Normal: Select this tool ONLY if the query can be answered using the available website 
        context and does NOT require any of the other tools listed above. If you cannot provide a sufficient
        answer using ONLY the website context, do NOT select this tool. do NOT use for Interactive request(Return: Normal)
        . if the question requires something external, do NOT use
        (Return(case sensitive) only: Normal)

        Prioritize the most accurate and efficient tool.Carefully consider all available information before making your selection.
          `

        const toolInstructionCleaned = toolInstruction.replace(/\s+/g, " ").trim()
        const tools = await globalSession.prompt(toolInstructionCleaned)

        console.log("tools", tools)

       let final_prompt = ""
       if(tools.includes("Interact")){
           final_prompt=`say "I'm  done" Only`
           await activateGlow(request.url)
           const data = await getInteractiveElements(request.params.arguments.url)
           const limitedData  = data.map(({ className, href,...rest }) => rest).map(obj =>{
            return Object.fromEntries(
              Object.entries(obj).filter(([_, value]) => value!== null)
            )
           })
           console.log("data", limitedData)
           const InteractiveDataString = JSON.stringify(limitedData)
           console.log(InteractiveDataString.length)


           const elements = await globalSession.prompt([{
            role: "user",
            content:[{ type: "text", value:`using the HTML object file: "${InteractiveDataString.trim()}, find the 
            ids({id: } in object file) in object most associated with this question: "${request.params.arguments.query}" and return their ids 
            in order of steps in interaction in this
            Follow this rule:
            -For searching for items, videos, etc or, lookup and insertig values  questions,look for input tags , i,e {tag: "input"} with {type: "text"}, or {type: "search"} ,
            {tag: "textarea"}. and use placeholder and label at for multiple inputs. Do NOT click button next to search, click on the input tag that itself
            -Do NOT use Image Search unless explicitly told
            -For clicking questions look for {tag: "button"}, {tag: "div"}, {tag: "a"}
            -ALWAYS check text, ariaLabels, and text for click, or touching events from objectFile to decided with id to use, if it matches with the question then pick
            -NEVER return an id with a false tag(critical mistake)
            -If the question requires one action return the single most importand id associated with that action
            -If they are multiple steps return ids in the order of actions to achieve the goal
            -If the query is vague then you can make a decison on which element to pick first based on the image provided
            and object file
            -Use Image to find the position of elements and which elements are more important
            format: (this are examples it must be their actual ids) multiple ids with comma sepertaing them(order of interaction) if multiple, and 1
            one i. ALWAYS seperate ids with commas between them
             if  single
             always CHECK the tag at end and do NOT forget to follow the rule. do NOT use id with bad tag
           `},
           {type: "image", value: websiteImage}
          ]
            }
          ])
          console.log("elements", elements)
          const stepElm = elements.split(',').map(num => parseInt(num.trim()));

          for(let i = 0; i<stepElm.length; i++){
            const elm = data[stepElm[i]]
            console.log("elm", elm)

            const elmClass =  '.' + elm.className.split(' ').join('.');
            const elmTag = elm.tag
            
            await InteractWithElement(globalURL, elmClass, elmTag, request.params.arguments.query);
            globalImage = await captureWebsiteAsImage(globalURL)
            const nextPrompt = await globalSession.prompt(`Based on the wesbite image do you need to click something else to perform users request: ${request.params.arguments.query}, or if you need to go back and you made mistake(hint: click close
               or cancel) based on image.return yes or no only(case sensitive), yes, if you're done and no if you aren't
              .Do NOT return no if the the user's request has not fully been fulfied and if image doesn't indicate it was, add your reason at the
               back of yes and no, and which element you picked `
               )
            console.log("next prompt", nextPrompt)
            if(nextPrompt.includes("yes")){
               await interactionLoop(request.params.arguments.query)
               break
            }else{
              final_prompt = `say "you're" done only`
            }
            
          }
          final_prompt = `say "you're" done only`
          await removeGlow()
          return
                    
       }
       else if (tools.includes("getYoutubeSubtitles")){
          if (isConnected === false){
              await connectToServer()
          }
          const response = await sendRequest("tools/call",{
               name: "getYoutubeSubtitles",
               arguments: { videoId: request.params.arguments.videoId}
           })
           console.log("videoId",request.params.arguments.videoId)
          const transcript  = response.content[0].text
          final_prompt += `Read Concisely and Answer this question: "${request.params.arguments.query}" using this 
          subtitles: "${transcript}"`

        }
        else if(tools.includes("simpleGoogleSearch")){
          if (isConnected === false){
              await connectToServer()
          }
          const query = await globalSession.prompt(`You are a search query generation AI. 
          You receive a user question and output the single best search query to answer it.
          STEP 1 - CLASSIFY THE QUESTION: 
          Ask yourself: "Can this question be answered without additional context?"

         DIRECT Question (complete and specific):
         - Has a clear subject
         - Asks a specific, answerable question
         - Contains all necessary information
         INDIRECT Question (incomplete or unclear or unspecific):
         - Missing key information (who, what, where, when, which)
         - References something without naming it ("the video", "that author", "they")
         - Vague or ambiguous phrasing         
         - Requires context to understand fully
         - Unspecific
         STEP 2 - GENERATE THE QUERY using this question "${request.params.arguments.query}":
         For DIRECT Questions:
         → Return the exact question word-for-word, unchanged
         For INDIRECT Questions:
         → Examine all previous conversation history
         → If a previous prompt/context needs an answer, answer it
         → Examine the website context
         → Identify the missing information/Unspecific part
         → Fill in the missing information/Unspecific part using the website context/ previous prompts/and your answer to previous prompts
         → Fill in missing information/Unspecific part by answering the question especially to the unspecific part(this is key)
          (e.g find missing title and name by forming a question "what is the title/name" answer it and get
          "Best Locations in 2025" or "John Stewart") using website context/previous prompts, this will be your specific part
         → Replace the unspecific part with the specific part
          
         → Return a new and complete version of the question(that has the original meaning)
         For INDIRECT Questions WITHOUT Usable Website Context/Previous Prompt:
         LOOK AGAIN
         If the new version of generated question is the same as or it is still unclear/unspecific
        /incomplete you have failed.

         CRITICAL OUTPUT RULES:
         - Output ONLY the search query
         - NO quotes around the output
         - NO explanations or commentary
         - Make queries specific and unambiguous
         - Don't add details not supported by context
         - Output should NEVER be vague and unspecific
         User Question: "${request.params.arguments.query}"
         Generated Search Query:
     `)
          console.log("query", query)
          const search = await sendRequest("tools/call", {
             name: "simpleGoogleSearch",
             arguments: {query}
          })

          const searchResult = search.content[0].text

          final_prompt+=`Read Concisely and Answer this question: "${request.params.arguments.query}" using the added information:
           "${searchResult}"`
        }
        else if(tools.includes("webGoogleSearch")){
          if (isConnected === false){
              await connectToServer()
          }
          const query = await globalSession.prompt(`You are a search query generation AI. 
          You receive a user question and output the single best search query to answer it.
          STEP 1 - CLASSIFY THE QUESTION: 
          Ask yourself: "Can this question be answered without additional context?"

         DIRECT Question (complete and specific):
         - Has a clear subject
         - Asks a specific, answerable question
         - Contains all necessary information
         INDIRECT Question (incomplete or unclear or unspecific):
         - Missing key information (who, what, where, when, which)
         - References something without naming it ("the video", "that author", "they")
         - Vague or ambiguous phrasing         
         - Requires context to understand fully
         - Unspecific
         STEP 2 - GENERATE THE QUERY using this question "${request.params.arguments.query}":
         For DIRECT Questions:
         → Return the exact question word-for-word, unchanged
         For INDIRECT Questions:
         → Examine all previous conversation history
         → If a previous prompt/context needs an answer, answer it
         → Examine the website context
         → Identify the missing information/Unspecific part
         → Fill in the missing information/Unspecific part using the website context/ previous prompts/and your answer to previous prompts
         → Fill in missing information/Unspecific part by answering the question especially to the unspecific part(this is key)
          (e.g find missing title and name by forming a question "what is the title/name" answer it and get
          "Best Locations in 2025" or "John Stewart") using website context/previous prompts, this will be your specific part
         → Replace the unspecific part with the specific part
          
         → Return a new and complete version of the question(that has the original meaning)
         For INDIRECT Questions WITHOUT Usable Website Context/Previous Prompt:
         LOOK AGAIN
         If the new version of generated question is the same as or it is still unclear/unspecific
        /incomplete you have failed.

         CRITICAL OUTPUT RULES:
         - Output ONLY the search query
         - NO quotes around the output
         - NO explanations or commentary
         - Make queries specific and unambiguous
         - Don't add details not supported by context
         - Output should NEVER be vague and unspecific
         User Question: "${request.params.arguments.query}"
         Generated Search Query:
     `)
          console.log("query", query)
          const search = await sendRequest("tools/call", {
             name: "webGoogleSearch",
             arguments: {query}
          })

          const searchResult = search.content[0].text

          final_prompt+=`Read Concisely and Answer this question: "${request.params.arguments.query}" using the added information:
           "${searchResult}"`
        }  else if(tools.includes("Normal")){
            final_prompt+=request.params.arguments.query
        }
        else if(tools.includes("NO-TOOL")){
           final_prompt+="i am ready"
        }

        return final_prompt
      } catch (error) {
        console.log("error delegating prompt", error)
        return request.params.arguments.query
      }
}






async function createNewSession(url){
  try{
    const [websiteImage, context, available] = await Promise.all([
        captureWebsiteAsImage(url),
        getNewConext(url),
        LanguageModel.availability()
    ]);
    console.log("website image", websiteImage)    
    console.log(available);
    if(available === "unavailable"){
        throw new Error("model not available")
    }

    const session = await LanguageModel.create({
        initialPrompts: [
          {
            role: "system",
            content:[
                {type: "text", value:`You are a tool picker for an MCP agent and Query generator,Your job
               is return tools and other comphrehensive/short answers
               You are also picking some tools and deciding using this, you will also generate queries and  answer questions
               using this  website image and website context provided to you: "${context.slice(0,37000)}"
               . You will read all prompts concisely, and make accurate and quick decisions and you will never return
               an Incomplete/Unspecific/Unclear query. Follow all instructions given to you
               `},
               {type: "image", value: websiteImage}
              ],
              },
             {
               role: "assistant",
               content: `Okay i will decide all prompts effectively, read in a concise manner, and make accurate decisions with tools and
               other prompts and i will not return unspecific/unclear/incomplete queries and follow all instructions`,
           },
         ],
            expectedInputs: [ { type: "text",languages: ["en", "ja" ]},
             { type: 'image' }
        ],
          expectedOutputs: [{ type: "text", languages: ["ja"] }],
          temperature: 0.3,
          topK: 3,
        });



    console.log("session created successfully")
    return session
    }catch(error){
      console.log("error creating new session", error)
    }
}


async function getNewConext(url){
   const [tab] =  await chrome.tabs.query({ active: true, url: url})

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
      func: () => {
          return (
            document.querySelector("title")?.innerText +
            " " +
            document.querySelector('meta[name="description"]')?.content +
            " " +
            document.body.innerText
          );
        },
  });

  return results[0].result
}
async function activateGlow (url) {
    console.log("creating glow element")
    const [tab] = await chrome.tabs.query({ active: true, url: url});

    chrome.scripting.executeScript({
      target: {tabId:  tab.id},
      func: () =>{
        const glow = document.createElement('div');
        glow.id = 'inner-glow'
        glow.style.position = 'fixed';
        glow.style.top = 0;
        glow.style.width = '100vw';
        glow.style.height = '100vh';
        glow.style.pointerEvents = 'none';
        glow.style.boxShadow = 'inset 0 0 0 40px rgba(0, 255, 255)';
        glow.style.zIndex = '9999999999';
        document.body.appendChild(glow)

      }
    })
}


async function removeGlow (url){
    const [tab] = await chrome.tabs.query({ active: true, url: url});

    chrome.scripting.executeScript({
      target: {tabId:  tab.id},
      func: () =>{
        document.getElementById('inner-glow')?.remove()
      }
    })
}
async function establishSession(request){
    try{  
        sidePanelActivated = true
        if(!globalSession){
          const [websiteImage, available] = await Promise.all([
            captureWebsiteAsImage(request.url),
            LanguageModel.availability()
          ]);
          console.log("website image", websiteImage)    
          console.log(available);
          if(available === "unavailable"){
             throw new Error("model not available")
          }

           globalSession = await LanguageModel.create({
            initialPrompts: [
              {
               role: "system",
               content:[
                {type: "text", value:`You are a tool picker for an MCP agent and Query generator,Your job
               is return tools and other comphrehensive/short answers
               You are also picking some tools and deciding using this, you will also generate queries and  answer questions
               using this  website image and website context provided to you: "${request.context.slice(0,37000)}"
               . You will read all prompts concisely, and make accurate and quick decisions and you will never return
               an Incomplete/Unspecific/Unclear query. Follow all instructions given to you
               `},
               {type: "image", value: websiteImage}
              ],
              },
             {
               role: "assistant",
               content: `Okay i will decide all prompts effectively, read in a concise manner, and make accurate decisions with tools and
               other prompts and i will not return unspecific/unclear/incomplete queries and follow all instructions`,
           },
         ],
            expectedInputs: [ { type: "text",languages: ["en", "ja" ]},
             { type: 'image' }
        ],
          expectedOutputs: [{ type: "text", languages: ["ja"] }],
          temperature: 0.3,
          topK: 3,
        });

        console.log("session created successfully")
      }

      return true
    }catch(error){
      console.log("eror initializing session on load", error)
      throw new Error("error initializing model")
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>{
   if(request.method === 'Establish_session_MCP'){
     console.log("establishing session for MCP gateway")
     establishSession(request).then(result => sendResponse({success: true, status: result })).catch(error =>
      sendResponse({success: false, error: error.message})
     )
     return true
   }
})



function destroySession(){
   globalSession?.destroy()
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>{
  if(request.method ==='destroy_session'){
       destroySession().then(result =>  sendResponse({success: true, answer: true})).catch(error =>{
        sendResponse({success: false,  error: error.message})
       })
  }
})

chrome.runtime.onSuspend.addListener(() =>{
  clearAllResource()
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>{
    console.log("Background received", request)
    if(request.method === 'MCP_gateway'){
      console.log("delegating prompt")
    delegatePrompt(request)
      .then(results => sendResponse({ success: true, answer: results }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true
    }
    
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request);
  console.log("extracting pages")
  if (request.action === 'extractPages') {
    extractMultiplePages(request.urls)
      .then(results => sendResponse({ success: true, data: results }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});




async function extractMultiplePages(urls) {
  const results = [];
  
  for (const url of urls) {
    try {
      const content = await extractPage(url);
      results.push({ url, content, success: true });
    } catch (error) {
      results.push({ url, error: error.message, success: false });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

chrome.tabs.onUpdated.addListener( async (tabId, changeInfo, tab) =>{
  if(changeInfo.url){
    const url = tab.url
    if((url.startsWith('chrome://') || url.startsWith('about://' )) && sidePanelActivated){
        console.log("can't copy url on a protected page")
    }else{
      console.log("URL changed:", changeInfo.url)

      globalURL = changeInfo.url
      handleURLchange(changeInfo.url)
      globalSession = await createNewSession(tab.url)
      chrome.runtime.sendMessage({type: "tab_update"})
      
    }
  }
})

chrome.tabs.onActivated.addListener(async (activeInfo) =>{
  try{
  const tab = await chrome.tabs.get(activeInfo.tabId)
  if(tab.url){

    if((tab.startsWith('chrome://') || tab.startsWith('about://')) && sidePanelActivated){
       console.log("you can not chnage tabs on protected pages")
    }else{
      globalURL = tab.url
      console.log("switched to tab", tab.url)
       handleURLchange(tab.url)
       globalSession = await createNewSession(tab.url)
      chrome.runtime.sendMessage({type: "tab_update"})
      
    }
    

  }
}catch(err){
   console.log("error recording url while switching tabs")
}
})

const handleURLchange =  (url) =>{
   if(!url) return
   globalURL = url
}
async function getInteractiveElements(url) {
  try {
    console.log("getting interactive elements")
    const [tab] = await chrome.tabs.query({ active: true, url: url});
    globalURL = url
    console.log("interaction url", globalURL)
    if (!tab) {
      throw new Error(`No active tab found matching URL: ${url}`);
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id},
      func: () => {
        let id = 0;

        const interactiveElements = document.querySelectorAll(
          `a, input, button, [tabindex], select, textarea,
          div[onclick], div[role], [contenteditables="true"]`
        );
          const getLabel = (el) => {

          if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) return label.innerText.trim();
          }
          const parentLabel = el.closest('label');
          if (parentLabel) return parentLabel.innerText.trim();
          
          if (el.hasAttribute('aria-labelledby')) {
            const labelId = el.getAttribute('aria-labelledby');
            const labelEl = document.getElementById(labelId);
            if (labelEl) return labelEl.innerText.trim();
          }
          
          return null;
        };
        console.log("getting visible elements")
        const visibleElements = [...interactiveElements].filter(el =>{
          const style = window.getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          

          return(
             style.display !== "none" &&
             style.visibility !== "hidden" &&
             style.opacity !== "0" &&
             rect.width > 0 &&
             rect.height > 0 &&
             rect.bottom > 0 &&
             rect.right > 0  &&
             rect.top < window.innerHeight &&
             rect.left < window.innerWidth
          )
        })
        
        const data = Array.from(visibleElements).map(el => ({
          id: id++,
          tag: el.tagName.toLowerCase(),
          className: el.className || "",
          text: el.innerText.trim().slice(0, 50),
          href: el.href  || null,
          placeholder: el.placeholder || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          label : getLabel(el),
          type: el.type || null
        }));
        
        return data;
      }
    });
   console.log("interactive table");
    return results[0].result;
    
  } catch (error) {
    console.error('Error getting interactive elements:', error);
    throw error;
  }
}

async function captureWebsiteAsImage(url){
  try{
  const [tab] = await chrome.tabs.query({active: true, url: url})
  if (!tab) {
      throw new Error(`No tab found with URL: ${url}`);
  }

  console.log("tab", tab)
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });

  await new Promise(resolve => setTimeout(resolve, 50));

  const imageUri = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  })
  console.log("imageUri")
  const res = await fetch(imageUri)
  const blob = await res.blob()
  capturedFile = new File([blob], "screenshot.png", {type: "image/png"})


  return capturedFile
}catch(err){
   console.log("Error capturing website as image:", err)
}
}

async function InteractWithElement(url, className, Tag, query){
  try{
    const [tab] = await chrome.tabs.query({ active: true, url: url});
    console.log("tab found", tab)


    if (!tab) {
      throw new Error(`No active tab found matching URL: ${url}`);
    }
    console.log("tab valid")
    const value = await globalSession.prompt(`Generate a value for what the the user is
    looking for, searching or wants to input, using this user question: "${query}"
   `)
   
    console.log("sending data ",className, Tag, value)
    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      args: [className, Tag, value],
      func: async(className, Tag, value) =>{
        const el = document.querySelector(className)
        console.log("element", el)
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 300));  
        const rect = el.getBoundingClientRect()
        const x = rect.left + rect.width/2;
        const y = rect.top + rect.height/2;
        const cursor = document.createElement('div');
        cursor.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.5 3.21V20.8L11.47 14.83L14.66 21.8L17.5 20.53L14.31 13.56L21.5 13.8L5.5 3.21Z" 
                  fill="white" stroke="black" stroke-width="1"/>
          </svg>
        `;
        cursor.style.cssText = `
          position: fixed;
          width: 24px;
          height: 24px;
          pointer-events: none;
          z-index: 99999999999;
          transform-origin: top left;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        `;
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        
        cursor.style.left = startX + 'px';
        cursor.style.top = startY + 'px';
        document.body.appendChild(cursor);
        
        await new Promise(r => requestAnimationFrame(r));
      
        const duration = 800;
        const startTime = Date.now();

        const controlX = (startX + x) / 2 + (Math.random() - 0.5) * 100;
        const controlY = (startY + y) / 2 + (Math.random() - 0.5) * 100;
        
        await new Promise(resolve => {
          function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const eased = 1 - Math.pow(1 - progress, 3);

            const t = eased;
            const currentX = 
              Math.pow(1-t, 2) * startX + 
              2 * (1-t) * t * controlX + 
              Math.pow(t, 2) * x;
            const currentY = 
              Math.pow(1-t, 2) * startY + 
              2 * (1-t) * t * controlY + 
              Math.pow(t, 2) * y;
            
            cursor.style.left = currentX + 'px';
            cursor.style.top = currentY + 'px';
            
            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              resolve();
            }
          }
          animate();
        });

        cursor.style.transform = 'scale(0.9)';
        await new Promise(r => setTimeout(r, 100));
        
        const evt = new MouseEvent("mousemove", {
          clientX: x,
          clientY: y,
          bubbles: true
        })

        el.dispatchEvent(evt)

        cursor.style.transform = 'scale(0.85)';
        await new Promise(r => setTimeout(r, 50));
        cursor.style.transform = 'scale(1)';

        await new Promise(r => setTimeout(r, 100));
        cursor.remove();
        try{
        switch(Tag){
           case 'a': {
              el.click()
              break;
            }
           case 'button': {
              el.click();
              break;
           }
           case 'input':
                
                el.click();
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

              break;
          case 'div':  {
              el.click();
              break;
          }
          default:
             break;
          


        }              
      } catch (err) {
          return { success: false, error: err.message };
        }

      }

    })
    return results[0].result;
  }catch(error){
    console.error('Error interacting with element:', error);
    throw error;
  }
}



function deactivateSidePanel(){
  console.log("deactivting side panel")
  globalSession.destroy()
  sidePanelActivated = false
  return true
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  if(message.method === "deactivate_sidepanel"){
    deactivateSidePanel().then(result => sendResponse({success: true, status: result}))
  }
})
