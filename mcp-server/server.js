import express from "express"
import dotenv from 'dotenv'
import { WebSocketServer } from "ws"

dotenv.config()

const port = process.env.PORT || 3000
const Rapid_API_Key = process.env.Rapid_API_Key
const EXA_API_Key = process.env.EXA_API_Key

const app = express()

const server = app.listen(port, () => console.log("MCP server on port 3000"))
const wss = new WebSocketServer({ server })


const getSubtitles = async(videoId) => {
    try {
        const listResponse = await fetch(`https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${videoId}`, {
            method: "GET",
            headers: {
                "X-RapidAPI-Key": Rapid_API_Key,
                "X-RapidAPI-Host": "youtube-transcript3.p.rapidapi.com",
            }
        })
        console.log("list response:", listResponse)
        if (!listResponse.ok) {
            throw new Error(`API request failed with status ${listResponse.status}`)
        }

        let fullTranscript = ""
        const captionList = await listResponse.json()
        console.log(captionList)
        
        if(captionList.success === true){
            const transcript = captionList.transcript
            transcript.forEach(value => {
                fullTranscript += value.text + value.offset
            })
        } else {
            throw new Error("Failed to retrieve subtitles")
        }
        fullTranscript = fullTranscript.trim().replace(/\s+/g, " ").slice(0, 10000)
        console.log(fullTranscript)
        return fullTranscript
    } catch (error) {
        console.error("Error fetching subtitles:", error)
        return `Transcript not available due to: ${error.message}`
        
    }
}



const simpleGoogleSearch = async(searchQuery) =>{
    try{
   const searchResponse = await fetch(`https://api.exa.ai/answer`,{
     method: 'POST',
     headers: {
        'Content-Type': 'application/json',
        'x-api-key':  EXA_API_Key

     },
     body: JSON.stringify({
        query: searchQuery,
        stream: false,
        systemPrompt: "always give the most accurate and up to date information"
     })
   })
    
    if (!searchResponse.ok) {
        throw new Error(`HTTP ${searchResponse.status}: ${responseText}`);
    }

   const data = await searchResponse.json()
   console.log(data.answer)
   console.log(searchQuery)
   return data.answer
}catch(error){
    console.log("Error searching:", error)
}

}



const webGoogleSearch = async(searchQuery) =>{
    try{
    console.log("starting search")
    const searchResponse = await fetch(`https://api.exa.ai/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key':  EXA_API_Key
            },
            body: JSON.stringify({
                query: searchQuery,
                numResults: 3,
                contents: {
                    text :{
                      maxCharacters: 1000
                    },
                    summary: true,
                    context: true,
                }
            })
        }
    )
    let searchResult = ""
    if (!searchResponse.ok) {
        throw new Error(`HTTP ${searchResponse.status}: ${responseText}`);
    }
    else{
        const data = await searchResponse.json()
        searchResult = data.context

        searchResult = searchResult.trim().replace(/\s+/g, " ").slice(0,2000)
        console.log("search results", searchResult, searchResult.length)
        return searchResult
    }
    
    
}catch(error){
    console.log("error message", error.message)
}
}




const toolHandlers = {}

const registerTool = (name, handler) =>{
    toolHandlers[name] = handler

}

registerTool("getYoutubeSubtitles", async({videoId}) =>{
    const transcript = await getSubtitles(videoId)
    return transcript
})

registerTool("simpleGoogleSearch", async({query}) =>{
    const transcript = await simpleGoogleSearch(query)
    return transcript
})


registerTool("webGoogleSearch", async({query}) =>{
    const webSearchResult = await webGoogleSearch(query)
    return webSearchResult
})






console.log(toolHandlers)


wss.on("connection", async (ws) => {
    console.log("Client connected")

    ws.on("message", async (data) =>{
        let msg

        try { 
            msg = JSON.parse(data)

        }catch{
            return
        }
        const { id, method, params } = msg

        if (method === "tools/call"){
            const {name, arguments: args} = params
            const handler = toolHandlers[name]
            let result
            try{
              result = await handler(args)
            }catch{
              result = "Transcript not available"
            }
            ws.send(JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: result 
                            }
                        ]
                    }
            }))
            
        }
    })


    ws.on('close', () => {
        console.log('MCP client disconnected');
    });

})




