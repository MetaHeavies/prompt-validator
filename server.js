import express from 'express';
import https from 'https';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { saveSchema, loadSchema, listSchemas } from './schemaManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '.env') });

const app = express();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MODEL_INFO = {
  "gpt-4-turbo": {
    contextWindow: 128000,
    inputCost: 0.01,  // per 1K tokens
    outputCost: 0.03, // per 1K tokens
    type: "openai"
  },
  "gpt-4o": {
    contextWindow: 128000,
    inputCost: 0.01,
    outputCost: 0.03,
    type: "openai"
  },
  "gpt-4o-mini": {
    contextWindow: 128000,
    inputCost: 0.005,
    outputCost: 0.015,
    type: "openai"
  },
  "claude-3-sonnet-20240229": {
    contextWindow: 200000,
    inputCost: 0.003,
    outputCost: 0.015,
    type: "anthropic"
  }
};

const assertionFunctions = {
  required: (value) => value !== null && value !== undefined && value !== '',
  llmValidated: async (value, criteria, validatorModel) => {
      const validationResult = await validateWithLLM(value, criteria, validatorModel);
      return validationResult.isValid;
  },
  custom: (value, criteria) => {
      try {
          return eval(criteria)(value);
      } catch (error) {
          console.error("Error in custom validation:", error);
          return false;
      }
  }
};

async function makeLLMCall(prompt, model, modelInfo) {
  console.log(`Making LLM call with prompt: ${prompt}, model: ${model}`);
  try {
    if (!modelInfo) {
      throw new Error(`Model info not found for model: ${model}`);
    }
    if (modelInfo.type === "anthropic") {
      return await makeAnthropicCall(prompt, model);
    } else if (modelInfo.type === "openai") {
      return await makeOpenAICall(prompt, model);
    } else {
      throw new Error(`Unsupported model type: ${modelInfo.type}`);
    }
  } catch (error) {
    console.error(`Error in LLM call: ${error.message}`);
    throw error;
  }
}

function makeOpenAICall(prompt, model) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a seasoned geospatial data analyst. Always respond with valid JSON without any markdown formatting." },
        { role: "user", content: prompt }
      ],
      temperature: 0
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`OpenAI API returned status code ${res.statusCode}`);
          console.error(`Response body: ${responseBody}`);
          reject(new Error(`OpenAI API Error: ${res.statusCode} ${res.statusMessage}`));
          return;
        }

        try {
          const response = JSON.parse(responseBody);
          console.log(response);
          if (response.error) {
            reject(new Error(`OpenAI API Error: ${response.error.message}`));
          } else if (response.choices && response.choices[0] && response.choices[0].message) {
            let content = response.choices[0].message.content;
            
            // Remove any Markdown formatting
            content = content.replace(/```json\n?|\n?```/g, '').trim();
            
            resolve({ content, usage: response.usage });
          } else {
            reject(new Error("Unexpected response structure from OpenAI API"));
          }
        } catch (error) {
          console.error(`Failed to parse OpenAI response: ${error.message}`);
          console.error(`Response body: ${responseBody}`);
          reject(new Error(`Failed to parse OpenAI response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`Request error: ${error.message}`);
      reject(new Error(`Request error: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

async function makeAnthropicCall(prompt, model) {
  console.log(`Making Anthropic call with prompt: ${prompt}`);
  try {
    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 1000,
      system: "You are a seasoned geospatial data analyst. Always respond with valid JSON without any markdown formatting.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    });

    let content = response.content[0].text;
    
    content = content.replace(/```json\n?|\n?```/g, '').trim();
    
    return {
      content,
      usage: response.usage
    };
  } catch (error) {
    console.error(`Anthropic API Error: ${error.message}`);
    throw new Error(`Anthropic API Error: ${error.message}`);
  }
}

async function validateWithLLM(value, description, model) {
  if (value === undefined || value === null) {
    return { isValid: false, reason: "Value is undefined or null" };
  }

  const prompt = `Analyze the following text and determine if it matches this description: "${description}".
    Your response must be EXACTLY in one of these two formats, with no additional text or JSON wrapping:

    1. If the text matches the description, respond with only:
    VALID

    2. If the text does not match the description, respond with:
    INVALID [brief explanation]

    Do not include any other text in your response. Do not wrap your response in JSON.

    Text to analyze: "${JSON.stringify(value)}"`;
  
  try {
    const modelInfo = MODEL_INFO[model];
    if (!modelInfo) {
      throw new Error(`Model info not found for model: ${model}`);
    }
    const response = await makeLLMCall(prompt, model, modelInfo);
    
    if (!response || !response.content) {
      throw new Error("Unexpected empty response from LLM");
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response.content);
    } catch (error) {
      // If it's not valid JSON, use the response as is
      parsedResponse = { response: response.content };
    }

    const result = (parsedResponse.response || '').trim().toUpperCase();

    if (result === "VALID") {
      console.log("LLM validation result: VALID");
      return { isValid: true, reason: "Passed LLM validation" };
    } else if (result.startsWith("INVALID")) {
      const explanation = result.slice(7).trim();
      console.log(`LLM validation result: INVALID - ${explanation}`);
      return { 
        isValid: false, 
        reason: explanation || "Failed LLM validation (no explanation provided)"
      };
    } else {
      // Handle the case where the model returns a specific error (like word count limit)
      console.log(`Unexpected LLM validation response: ${response.content}`);
      return { 
        isValid: false, 
        reason: response.content
      };
    }
  } catch (error) {
    console.error("Error in LLM validation:", error);
    return { isValid: false, reason: `Error occurred during LLM validation: ${error.message}` };
  }
}

async function generateResponse(attemptPrompt, expectedStructure, promptModel, attemptCount, lastValidationResult, modelInfo) {

  let structurePrompt = `${attemptPrompt}

### Response Structure 
Generate a valid JSON response using the following structure including only these fields

${JSON.stringify(expectedStructure.reduce((acc, item) => {
  acc[item.key] = `${item.type}: ${item.description}`;
  return acc;
}, {}), null, 2)}
`;

  if (attemptCount > 1 && lastValidationResult) {
    structurePrompt += `

### Previous Attempt
Previous attempt failed validation. Please generate a new and different response that addresses these issues:
${JSON.stringify(lastValidationResult.results, null, 2)}

Ensure your new response is different from the previous one and adheres to all specified requirements.`;
  }

  const result = await makeLLMCall(structurePrompt, promptModel, modelInfo);

  try {
    const parsedContent = JSON.parse(result.content);
    return { 
      response: parsedContent.response || parsedContent, // Unwrap if nested
      usage: result.usage
    };
  } catch (error) {
    console.error(`Error parsing LLM response: ${error.message}`);
    return { response: null, usage: result.usage };
  }
}

function validateField(value, fieldDef) {
  switch(fieldDef.type) {
      case 'str':
          return typeof value === 'string';
      case 'num':
          return typeof value === 'number';
      case 'bool':
          return typeof value === 'boolean';
      case 'arr':
          return Array.isArray(value) && (fieldDef.contentType ? value.every(item => typeof item === fieldDef.contentType.toLowerCase()) : true);
      case 'obj':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
              return false;
          }
          const keys = Object.keys(value);
          if (keys.length !== 1) {
              return false;
          }
          const entityValue = value[keys[0]];
          return typeof entityValue === 'string' || typeof entityValue === 'number' || typeof entityValue === 'boolean';
      default:
          return false;
  }
}

app.post('/api/validate', async (req, res) => {
  console.log("Received /api/validate request");
  let { prompt, promptModel, validatorModel, retries, expectedStructure } = req.body;

  if (!prompt || !promptModel || !validatorModel || !retries || !expectedStructure) {
    console.error("Missing required parameters");
    return res.status(400).json({ error: "Missing required parameters" });
  }

  let attemptCount = 0;
  let validResponse = null;
  let lastValidationResult = null;
  let allAttempts = [];

  while (attemptCount < retries) {
    attemptCount++;
    console.log(`Attempt ${attemptCount} to generate and validate response`);

    const { response: generatedResponse, usage } = await generateResponse(
      prompt, 
      expectedStructure, 
      promptModel, 
      attemptCount, 
      lastValidationResult, 
      MODEL_INFO[promptModel]
    );

    if (!generatedResponse) {
      console.log("Generated response is null or undefined");
      continue;
    }

    lastValidationResult = await validateResponse(JSON.stringify(generatedResponse), expectedStructure, validatorModel);

    allAttempts.push({
      attempt: attemptCount,
      response: generatedResponse,
      usage: usage,
      validationResult: lastValidationResult
    });

    if (lastValidationResult.isValid) {
      validResponse = generatedResponse;
      break;
    }
  }

  if (validResponse) {
    const lastAttempt = allAttempts[allAttempts.length - 1];
    const cost = calculateCost(lastAttempt.usage, MODEL_INFO[promptModel]);
    res.json({ 
      success: true, 
      response: validResponse, 
      usage: lastAttempt.usage,
      cost: cost,
      attempts: attemptCount,
      allAttempts: allAttempts
    });
  } else {
    const lastAttempt = allAttempts[allAttempts.length - 1];
    const cost = calculateCost(lastAttempt.usage, MODEL_INFO[promptModel]);
    res.json({ 
      success: false, 
      message: "Could not generate a valid response", 
      usage: lastAttempt.usage,
      cost: cost,
      attempts: attemptCount,
      lastValidationResult: lastValidationResult,
      allAttempts: allAttempts
    });
  }
});

function calculateCost(usage, modelInfo) {
  let inputTokens, outputTokens;

  if ('prompt_tokens' in usage) {
    // OpenAI structure
    inputTokens = usage.prompt_tokens;
    outputTokens = usage.completion_tokens;
  } else if ('input_tokens' in usage) {
    // Anthropic structure
    inputTokens = usage.input_tokens;
    outputTokens = usage.output_tokens;
  } else {
    throw new Error('Unrecognized usage structure');
  }

  const inputCost = (inputTokens / 1000) * modelInfo.inputCost;
  const outputCost = (outputTokens / 1000) * modelInfo.outputCost;
  
  return {
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: (inputCost + outputCost).toFixed(6),
    costPerThousand: ((inputCost + outputCost) * 1000).toFixed(6),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

async function validateResponse(response, expectedStructure, validatorModel) {
  const result = {
      isValid: true,
      expectedKeys: expectedStructure.length,
      receivedKeys: 0,
      keyResults: [],
      extraKeys: [],
      rawResponse: response
  };

  try {
    let parsedResponse = JSON.parse(response);
    console.log("Parsed response:", parsedResponse);
    const responseContent = parsedResponse.content ? parsedResponse.content : parsedResponse;

    if (typeof responseContent !== 'object' || responseContent === null) {
        throw new Error('Response content is not a valid object');
    }

    result.receivedKeys = Object.keys(responseContent).length;
    result.responseContent = responseContent;
    
    for (const item of expectedStructure) {
      const { key, type, description, llmValidation } = item;
      let value = responseContent[key];

      const keyResult = {
          key,
          value,
          isValid: true,
          type: {
              expected: type,
              received: Array.isArray(value) ? 'arr' : typeof value,
              isValid: true
          },
          llmValidationResult: null
      };

      // Type checking
      if (!validateField(value, { type })) {
          keyResult.isValid = false;
          keyResult.type.isValid = false;
          keyResult.error = `Type mismatch for "${key}": expected ${type}, got ${keyResult.type.received}`;
      }

      // LLM validation
      if (llmValidation) {
          const validationResult = await validateWithLLM(value, description, validatorModel);
          keyResult.llmValidationResult = validationResult;
          if (!validationResult.isValid) {
              keyResult.isValid = false;
          }
      }

      result.keyResults.push(keyResult);
      if (!keyResult.isValid) {
          result.isValid = false;
      }
    }

    const expectedKeys = expectedStructure.map(item => item.key);
    result.extraKeys = Object.keys(responseContent).filter(key => !expectedKeys.includes(key));
    if (result.extraKeys.length > 0) {
        result.isValid = false;
        result.extraKeysError = `Unexpected extra keys found: ${result.extraKeys.join(', ')}`;
    }

  } catch (error) {
    result.isValid = false;
    result.error = `Error processing response: ${error.message}`;
  }

  return result;
}

app.post('/api/save-schema', async (req, res) => {
  try {
    const result = await saveSchema(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/load-schema/:version', async (req, res) => {
  try {
    const schema = await loadSchema(req.params.version);
    res.json(schema);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/list-schemas', async (req, res) => {
  try {
    const schemas = await listSchemas();
    res.json(schemas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list schemas' });
  }
});

const PORT = 3000;
app.listen(PORT, (err) => {
  if (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('To test the API, send a POST request to http://localhost:3000/api/validate');
});

app.get('/', (req, res) => {
  console.log("Received GET request on '/' route");
  res.send('LLM Validation Server is running. Use the /api/validate endpoint for validation requests.');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.originalUrl}`);
  res.status(404).send("Sorry, that route doesn't exist.");
});
