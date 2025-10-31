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
let controller =  new AbortController();

importScripts("config.js")





const connectToServer = () => {
    return new Promise((resolve, reject) => {
        ws = new WebSocket(`ws://${CONFIG.HOST}`)
        
        const connectionTimeout = setTimeout(() => {
            reject(new Error('Connection timeout'))
            if (ws) ws.close()
        }, 100)

        ws.onopen = () => {
            console.log('WebSocket connected')
            clearTimeout(connectionTimeout)
            isConnected = true
            resolve() 
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
async function interactionLoop(query,id,url){
  if(interactions > maxInteractions){
    return
  }
  interactions = interactions + 1
  try{
     await activateGlow(url)
     const data = await getInteractiveElements(globalURL)
     const limitedData = data.map(({ className, href,...rest }) => rest).map(obj =>{
            return Object.fromEntries(
              Object.entries(obj).filter(([_, value]) => value!== null)
            )
           });
     console.log("interaction loop new data", limitedData)
     const InteractiveDataString = JSON.stringify(limitedData)
     const elements = await globalSession.prompt(`Given a stringified JSON representation of an HTML object (${InteractiveDataString.trim()}) and a user query (${query}), identify the semantically most relevant and valid HTML 
           element IDs to interact with, in the precise order of steps required, to flawlessly fulfill the query's intent. The focus is on accuracy and avoiding ANY invalid ID selection.
           Critical Constraints (Absolute, Unbreakable Rules):
           ID Validity: THE MOST IMPORTANT RULE. Only return IDs that:
           Exist as keys in the parsed JSON representation of  HTML Object file
           Correspond to actual HTML elements with a defined tag. If an ID is not a key in the JSON or 
           lacks a valid tag attribute within the JSON, it is a "false tag" and MUST NEVER BE RETURNED. 
           This is non-negotiable. Double-check every ID before including it in the output.
           Search & Input Fields (Specialized Handling):
           For queries involving search or data entry, prioritize finding elements 
           with {tag: "input"} and type attribute equal to "text" or "search", or elements 
           with {tag: "textarea"}.
           Use the placeholder attribute, combined with any associated {tag: "label"} element's 
           text (identified using the for attribute), to accurately determine if the input field
            matches the query's intent. Do not rely solely on placeholder text.
          CRITICAL EXCLUSION: Never select the ID of a search bar or input field if it already 
          contains text (i.e., its value attribute is not empty).
          ID Rule: do NOT select element with this id: "${id}" no matter what, look for another alternative(IMPORTANT)
          CLOSE RULE: if you need close something, because an element is hidden look for an id that can close it
          Search Submission: Immediately after identifying the ID of a search {tag: "input"} 
          field (as described above), always locate the associated "submit" element. This is 
          typically a {tag: "button"}, a {tag: "div"} (with role="button" or similar), or a 
          {tag: "input"} with type="submit" located adjacent to the search input in the HTML 
          structure. Append the submit element's ID to the list immediately after the search input's ID.
          Interaction Element Selection: For actions like clicking or selecting, prioritize elements with these tags: {tag: "button"}, {tag: "div"}, {tag: "a"}. Thoroughly examine the text, aria-label, and event handler attributes (looking for click/touch events) to confirm a strong semantic match with the query.
          Precise Interaction Order: The order of returned IDs must reflect the exact 
          sequence of actions a user would take to accomplish the query's objective.
          SEQUENCE OF ACTIONS: select ids based on steps to answer the users request, 
          e.g buy a shirt is search for shirt, click on result, click on add to cart, click 
          on cat, click on checkout
          SEARCH RESULTS: after selecting if with search, look for results based on image and click on it
          if search result is not displayed look for id that is search button
          Homepage Navigation: Only select the website title's ID if the query explicitly
            asks to return to the homepage.
          Image Search Restraint: Only consider visual information (implied image context) 
          if the query is genuinely ambiguous after a thorough analysis of the text, labels, 
          and attributes in the object file. Explicitly being asked to use Image search
          Output Specificity: If the query requires only a single action, return only the 
          single, most relevant ID. For multiple actions, return a comma-separated string of IDs in the correct sequence. Do not add any extra text or formatting.
          Decision-Making Heuristics:
          When the query is vague, use the image context (as you have it),
           and the HTML structure to make the best informed decision about the priority of 
           elements to be selected.
          Process Steps:
          Parse HTML object file as JSON.
          Analyze ${query} to understand the user's intent.
          Iterate through the parsed HTML object, methodically applying the filtering, ranking, 
          and exclusion rules.
          CRITICAL VALIDATION: Before returning any ID, absolutely verify that it:
          Exists as a key in the parsed JSON.
          Has a valid tag attribute within the JSON.
          Return the formatted  of IDs (or the single ID, if appropriate). e.g(example not actual output) 1,3,2  or 4.
          return only the numbers in the ids, nothing else and seperate it by commas if multiple. always follow the same format
            
            `)
      console.log("elements", elements)
      const stepElm = elements.split(',').map(num => parseInt(num.trim()));

      for(let i = 0; i<stepElm.length; i++){
            const elm = data[stepElm[i]]
            console.log("elm", elm)

            const elmClass =  '.' + elm.className.split(' ').join('.');
            const elmTag = elm.tag
           
            await InteractWithElement(globalURL, elmClass, elmTag, query);
            if(url === globalURL){
                console.log("interaction on same page...")
                globalSession = await createNewSession(globalURL)
            }
            const nextPrompt = await globalSession.prompt( `Analyze the provided image of a user interface in the context of the user's request: '${query}'. Your task is to determine if further interaction is required to fully fulfill the request. Respond with only 'yes' or 'no' (case-sensitive), followed by a comma, the element you interacted with (or would interact with if the answer is 'no'), and a concise explanation based solely on the image.
            Here's the decision-making process:
            YES Condition: Answer 'yes' if the previous action has demonstrably completed the 
            user's request and the image provides clear visual confirmation of this completion. Also answer 'yes' if the UI suggests a need to go back or correct a mistake (e.g., 'Cancel', 'Close', 'Back' buttons are relevant). The explanation should state why the image confirms completion or necessitates going back. Example: 'yes, clicked confirmation button, image shows success message'.
            NO Condition: Answer 'no' if the user's request is not fully fulfilled based on the image 
            and the image provides no clear indication of completion. The explanation should state why the image indicates the request is incomplete. Example: 'no, clicked search result link, image shows loading animation'.
            Critical Restrictions (ABSOLUTELY MUST FOLLOW):
            SEARCH BAR AVOIDANCE: Never interact with search bars or input fields, especially if they already contain a value. Focus on interpreting and interacting with the results displayed below or on the page as a consequence of a prior search. If a search bar was used in a previous step, do not interact with it again. If results from a prior search are present, interact with those results, not the search bar itself.
            SEARCH BAR BUTTON: IF the search bar doesn't display any  related result then you need to click the search button close to the search bar, do NOT click on cancel search.
            ELEMENT EXCLUSION: Under no circumstances interact with the element identified by the ID: '${stepElm[i]}'. Treat this element as if it doesn't exist.
            RESULT-DRIVEN INTERACTION: If a search bar is displaying results (even if partially), always prioritize interacting with those results over clicking the search bar. Look for results that best match the user's query.
            IMAGE-BASED DECISIONS: Your decision must be based solely on the visual information presented in the image. Do not rely on prior knowledge or assumptions about the underlying system.`
             )

            console.log("next prompt", nextPrompt)
            if(nextPrompt.includes("yes")){
               await interactionLoop(query, stepElm[i], globalURL)
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
          sidePanelActivated = true
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
          signal: controller.signal
        });

        console.log("session created successfully")
      }
        const toolInstruction =  `You are a tool selection assistant. Your task is to analyze a user query
         and determine the most appropriate tool from a predefined list. 
         Return ONLY the tool name, using the exact capitalization specified, and NO surrounding characters or punctuation.
         Here are the tools and their selection criteria:
        Interact: Select this tool when the user is asking to directly interact with the current 
        webpage (e.g., click, fill, search within the site). The interaction MUST be a specific and 
        clear request, not a vague one. It should involve using a specific functionality available on 
        the website (e.g., buying a product, watching a video, performing a site search).(Return(Case sensitive): Interact)

        getYoutubeSubtitles: Select this tool when the query requires information directly extracted 
        from YouTube video subtitles. This includes requests for summaries, lyrics, specific phrases, or 
        any question related to the video's content as presented in the subtitles. If a more detailed response is needed (e.g., YouTube video summary), 
        choose this tool. Do NOT use this for information outside the video content itself. 
        If this tool has been used in a previous turn, do NOT use it again. 
        Do NOT use for fact-checking unless you already know the information to be true from the 
        video (e.g. likes, title, youtuber's name, comments, etc.). Ensure ${request.params.arguments.videoId} is NOT null before selecting this tool.
        (Return(Case Sensitive): getYoutubeSubtitles)

        simpleGoogleSearch: Select this tool when the query requires accessing real-time 
        information (e.g., weather, sports scores) or supplementary information NOT available 
        within the current website context. ALWAYS check the website context FIRST to see if the query 
        can be answered without external assistance. If the provided context doesn't answer the question,    
        or if the user explicitly instructs you to use this tool, select it. 
        Do NOT use this tool for interaction requests on a website. Only use it for factual 
        and real-time information needs.(Return(Case Sensitive): simpleGoogleSearch)

       webGoogleSearch: Select this tool when the query requires consulting multiple external 
       websites to arrive at an answer. ALWAYS check the website context FIRST to see if the query
       can be answered without searching the web. If the provided context doesn't answer the question,
      or if the user explicitly instructs you to use this tool, select it. Do NOT use this tool for 
      interaction requests on a website. Prioritize it for factual and real-time information needs,
      or for fact-checking.(Return(Case Sensitive): webGoogleSearch)
      Normal: Select this tool ONLY if the query can be answered using the available 
      website context and does NOT require any of the other tools listed above. If you cannot 
      provide a sufficient answer using ONLY the website context, do NOT use this tool. 
      Do NOT use this for YouTube summaries. Do NOT use it if you don't have the information 
      to answer the question. Do NOT use this for interactive requests. If the question requires 
      something external, do NOT use this tool.(Return(Case Sensitive): Normal)

   

        Prioritize selecting the most accurate and efficient tool. Carefully consider all 
        available information before making your selection based on the user 
        query: "${request.params.arguments.query}".
          `

        const toolInstructionCleaned = toolInstruction.replace(/\s+/g, " ").trim()
        const tools = await globalSession.prompt(toolInstructionCleaned)

        console.log("tools", tools)

       let final_prompt = ""
       if(tools.includes("Interact")){
           final_prompt=`say "I'm  done" Only`
           await activateGlow(request.url)
           chrome.runtime.sendMessage({method: "update_content", content: "Interaction mode is on"})
           const data = await getInteractiveElements(request.params.arguments.url)
           const limitedData  = data.map(({ className, href,...rest }) => rest).map(obj =>{
            return Object.fromEntries(
              Object.entries(obj).filter(([_, value]) => value!== null)
            )
           })
           console.log("data", limitedData)
           const InteractiveDataString = JSON.stringify(limitedData)
           console.log(InteractiveDataString.length)


           const elements = await globalSession.prompt(`Given a stringified JSON representation of an HTML object (${InteractiveDataString.trim()}) and a user query (${request.params.arguments.query}), identify the semantically most relevant and valid HTML 
           element IDs to interact with, in the precise order of steps required, to flawlessly fulfill the query's intent. The focus is on accuracy and avoiding ANY invalid ID selection.
           Critical Constraints (Absolute, Unbreakable Rules):
           ID Validity: THE MOST IMPORTANT RULE. Only return IDs that:
           Exist as keys in the parsed JSON representation of  HTML Object file
           Correspond to actual HTML elements with a defined tag. If an ID is not a key in the JSON or 
           lacks a valid tag attribute within the JSON, it is a "false tag" and MUST NEVER BE RETURNED. 
           This is non-negotiable. Double-check every ID before including it in the output.
           Search & Input Fields (Specialized Handling):
           For queries involving search or data entry, prioritize finding elements 
           with {tag: "input"} and type attribute equal to "text" or "search", or elements 
           with {tag: "textarea"}.
           Use the placeholder attribute, combined with any associated {tag: "label"} element's 
           text (identified using the for attribute), to accurately determine if the input field
            matches the query's intent. Do not rely solely on placeholder text.
          CRITICAL EXCLUSION: Never select the ID of a search bar or input field if it already 
          contains text (i.e., its value attribute is not empty).
          Search Submission: Immediately after identifying the ID of a search {tag: "input"} 
          field (as described above), always locate the associated "submit" element. This is 
          typically a {tag: "button"}, a {tag: "div"} (with role="button" or similar), or a 
          {tag: "input"} with type="submit" located adjacent to the search input in the HTML 
          structure. Append the submit element's ID to the list immediately after the search input's ID.
          Interaction Element Selection: For actions like clicking or selecting, prioritize elements with these tags: {tag: "button"}, {tag: "div"}, {tag: "a"}. Thoroughly examine the text, aria-label, and event handler attributes (looking for click/touch events) to confirm a strong semantic match with the query.
          Precise Interaction Order: The order of returned IDs must reflect the exact 
          sequence of actions a user would take to accomplish the query's objective.
          SEQUENCE OF ACTIONS: select ids based on steps to answer the users request, 
          e.g buy a shirt is search for shirt, click on result, click on add to cart, click 
          on cat, click on checkout
          SEARCH RESULTS: after selecting if with search, look for results based on image and click on it
          if search result is not displayed look for id that is search button
          Homepage Navigation: Only select the website title's ID if the query explicitly
            asks to return to the homepage.
          Image Search Restraint: Only consider visual information (implied image context) 
          if the query is genuinely ambiguous after a thorough analysis of the text, labels, 
          and attributes in the object file. Explicitly being asked to use Image search
          Output Specificity: If the query requires only a single action, return only the 
          single, most relevant ID. For multiple actions, return a comma-separated string of IDs in the correct sequence. Do not add any extra text or formatting.
          Decision-Making Heuristics:
          When the query is vague, use the image context (as you have it),
           and the HTML structure to make the best informed decision about the priority of 
           elements to be selected.
          Process Steps:
          Parse HTML object file as JSON.
          Analyze ${request.params.arguments.query} to understand the user's intent.
          Iterate through the parsed HTML object, methodically applying the filtering, ranking, 
          and exclusion rules.
          CRITICAL VALIDATION: Before returning any ID, absolutely verify that it:
          Exists as a key in the parsed JSON.
          Has a valid tag attribute within the JSON.
          Return the formatted  of IDs (or the single ID, if appropriate). e.g(example not actual output) 1,3,2  or 4.
          return only the numbers in the ids, nothing else and seperate it by commas if multiple. always follow the same format
           `)
          console.log("elements", elements)
          const stepElm = elements.split(',').map(num => parseInt(num.trim()));

          for(let i = 0; i<stepElm.length; i++){
            const elm = data[stepElm[i]]
            console.log("elm", elm)

            const elmClass =  '.' + elm.className.split(' ').join('.');
            const elmTag = elm.tag
            
            await InteractWithElement(globalURL, elmClass, elmTag, request.params.arguments.query);
            if(request.params.arguments.url === globalURL){
                console.log("interaction on same page...")
                globalSession = await createNewSession(globalURL)
            }
            const nextPrompt = await globalSession.prompt(`Analyze the provided image of a user interface in the context of the user's request: '${request.params.arguments.query}'. Your task is to determine if further interaction is required to fully fulfill the request. Respond with only 'yes' or 'no' (case-sensitive), followed by a comma, the element you interacted with (or would interact with if the answer is 'no'), and a concise explanation based solely on the image.
            Here's the decision-making process:
            YES Condition: Answer 'yes' if the previous action has demonstrably completed the 
            user's request and the image provides clear visual confirmation of this completion. Also answer 'yes' if the UI suggests a need to go back or correct a mistake (e.g., 'Cancel', 'Close', 'Back' buttons are relevant). The explanation should state why the image confirms completion or necessitates going back. Example: 'yes, clicked confirmation button, image shows success message'.
            NO Condition: Answer 'no' if the user's request is not fully fulfilled based on the image 
            and the image provides no clear indication of completion. The explanation should state why the image indicates the request is incomplete. Example: 'no, clicked search result link, image shows loading animation'.
            Critical Restrictions (ABSOLUTELY MUST FOLLOW):
            SEARCH BAR AVOIDANCE: Never interact with search bars or input fields, especially if they already contain a value. Focus on interpreting and interacting with the results/Images/Titles displayed below or on the page as a consequence of a prior search. If a search bar was used in a previous step, do not interact with it again. If results from a prior search are present, interact with those results, not the search bar itself.
            ELEMENT EXCLUSION: Under no circumstances interact with the element identified by the ID: '${stepElm[i]}'. Treat this element as if it doesn't exist.
            RESULT-DRIVEN INTERACTION: If a search bar is displaying results (even if partially), always prioritize interacting with those results over clicking the search bar. Look for results that best match the user's query.
            IMAGE-BASED DECISIONS: Your decision must be based solely on the visual information presented in the image. Do not rely on prior knowledge or assumptions about the underlying system.
            `
               )
            console.log("next prompt", nextPrompt)
            if(nextPrompt.includes("yes")){
               await interactionLoop(request.params.arguments.query, stepElm[i], globalURL)
               break
            }else{
              final_prompt = `say "i'm done" only`
            }
            
          }
          final_prompt = `say "i'm done" only`
          await removeGlow()
          return final_prompt
                    
       }
       else if (tools.includes("getYoutubeSubtitles")){
          if (isConnected === false){
              await connectToServer()
          }
          chrome.runtime.sendMessage({method: "update_content", content: "Getting youtube subtitles"})
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
          chrome.runtime.sendMessage({method: "update_content", content: "searching the web"})
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
          chrome.runtime.sendMessage({method: "update_content", content: "perfoming a deep search"})
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
        else{
           final_prompt+=request.params.arguments.query
        }

        return final_prompt
      } catch (error) {
        console.log("error delegating prompt", error)
        return request.params.arguments.query
      }
}






async function createNewSession(url){
  try{
    const websiteImage = await captureWebsiteAsImage(url)
    const [context, available] = await Promise.all([
        getNewConext(url),
        LanguageModel.availability()
    ]);
    controller =  new AbortController();
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
               .You will read all prompts concisely, and make accurate and quick decisions and you will never return
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
          signal: controller.signal
        });




    console.log("session created successfully")
    return session
    }catch(error){
      console.log("error creating new session", error)
    }
}


async function getNewConext(url){
  let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
    }

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
    let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
    }

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
        glow.style.boxShadow = 'inset 0 0 25px rgb(0, 255, 255)';
        glow.style.zIndex = '9999999999';
        document.body.appendChild(glow)

      }
    })
}


async function removeGlow (url){
  let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
    }

    chrome.scripting.executeScript({
      target: {tabId:  tab.id},
      func: () =>{
        document.getElementById('inner-glow')?.remove()
      }
    })
}

function stopResponse () {
   controller.abort()
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>{
  if(message.method === "abort_mcp_session"){
    stopResponse()
    sendResponse({success: true})
  }
})
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
          signal: controller.signal
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
       destroySession()
       sendResponse({success: true})
       return true
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


chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true}).catch((error) =>{
  console.log( console.error(error))
})



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
  try{
  if(changeInfo.url){
    const url = tab.url
    if(url.startsWith('chrome://') || url.startsWith('about://' )){
        console.log("can't copy url on a protected page")
    }else if(sidePanelActivated){
      console.log("URL changed:", changeInfo.url)

      globalURL = changeInfo.url
      handleURLchange(changeInfo.url)
      await new Promise(r => setTimeout(r, 100))
      globalSession = await createNewSession(tab.url)
      await new Promise(r => setTimeout(r, 100))
      chrome.runtime.sendMessage({type: "tab_update", url: tab.url})
      
    }
  }
}catch(err){
  console.log("error occured while recording new url", err)
}
})

chrome.tabs.onActivated.addListener(async (activeInfo) =>{
  try{
  const tab = await chrome.tabs.get(activeInfo.tabId)
  if(tab.url){

    if(tab.url.startsWith('chrome://') || tab.url.startsWith('about://')){
       console.log("you can not change tabs on protected pages")
    }else if(sidePanelActivated){
      globalURL = tab.url
      console.log("switched to tab", tab.url)
      handleURLchange(tab.url)
      await new Promise(r => setTimeout(r, 100))
      globalSession = await createNewSession(tab.url)
      await new Promise(r => setTimeout(r, 100))
      chrome.runtime.sendMessage({type: "tab_update", url: tab.url})
      
    }
    

  }
}catch(err){
   console.log("error recording url while switching tabs", err)
}
})

const handleURLchange =  (url) =>{
   if(!url) return
   globalURL = url
}
async function getInteractiveElements(url) {
  try {
    console.log("getting interactive elements")
    globalURL = url
    let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
    }
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
  let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
    }
    

  console.log("tab", tab)
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });

  await new Promise(resolve => setTimeout(resolve, 300));

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
  let [tab] = await chrome.tabs.query({active: true, url: url})
    if (!tab) {
        const urlPattern = url.endsWith('*') ? url : `${url}*`;
        [tab] = await chrome.tabs.query({active: true, url: urlPattern});
    }
    
    if (!tab) {
        try {
            const urlObj = new URL(url);
            const basePattern = `${urlObj.protocol}//${urlObj.host}/*`;
            [tab] = await chrome.tabs.query({active: true, url: basePattern});
        } catch (e) {
          
        }
    }
    
    if (!tab) {
        throw new Error(`No tab found with URL: ${url}`);
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
                el.click()

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
