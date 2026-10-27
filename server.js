import express from 'express';
import ollama from 'ollama';

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// 1. Define your backend tool function
// 1. Updated backend tool with defensive argument handling
function getTheWeather(args = {}) {
    // Fallback to a default city if the LLM forgot to pass it
    const city = args.city || 'Unknown';

    console.log(`[Backend Tool Executed] Fetching weather for: ${city}`);

    if (city.toLowerCase() === 'lahore') {
        return JSON.stringify({ temperature: '18°C', condition: 'Partly Cloudy' });
    }
    return JSON.stringify({ temperature: '22°C', condition: 'Sunny' });
}

// 2. Define the tool schema for the LLM
const weatherToolDefinition = {
    type: 'function',
    function: {
        name: 'getTheWeather',
        description: 'Get the current weather for a given city.',
        parameters: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'The city name, e.g. London, Tokyo',
                },
            },
            required: ['city'],
        },
    },
};

// 3. Create the agent API endpoint
app.post('/api/agent', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required in the request body.' });
        }

        // Initialize conversation history
        const messages = [{ role: 'user', content: prompt }];

        console.log(`\n[Request Received] Prompt: "${prompt}"`);
        console.log('1. Sending prompt to local Ollama model...');

        // First call: The model decides if it needs a tool
        const response = await ollama.chat({
            model: 'qwen3:4b',//'llama3.2:1b'
            messages: messages,
            tools: [weatherToolDefinition],
        });

        messages.push(response.message);

        // Check if the model triggered a tool call
        if (response.message.tool_calls && response.message.tool_calls.length > 0) {
            for (const toolCall of response.message.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = toolCall.function.arguments;

                console.log(`-> LLM called tool: "${functionName}" with args:`, functionArgs);

                if (functionName === 'getTheWeather') {
                    // Execute your local backend function
                    const toolResultJson = getTheWeather(functionArgs);

                    console.log(`-> Tool returned data:`, toolResultJson);

                    // Append tool result back into history
                    messages.push({
                        role: 'tool',
                        content: toolResultJson,
                    });
                }
            }

            console.log('2. Sending tool results back to Ollama for final formulation...');

            // Second call: Model formats the final answer using the tool output
            const finalResponse = await ollama.chat({
                model: 'qwen3:4b',// 'llama3.2:1b'
                messages: messages,
            });

            return res.json({
                success: true,
                response: finalResponse.message.content,
            });
        }

        // If no tool was needed, return direct response
        return res.json({
            success: true,
            response: response.message.content,
        });

    } catch (error) {
        console.error('Agent Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Start the Express server
const PORT = 6000;
app.listen(PORT, () => {
    console.log(`🚀 Agent Express Server running on http://localhost:${PORT}`);
});