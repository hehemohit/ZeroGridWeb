const axios = require('axios');
require('dotenv').config();
const key = process.env.GROQ_API_KEY;

async function test(model) {
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model,
      messages: [{ role: 'user', content: 'Say OK in JSON: {"status":"OK"}' }],
      response_format: { type: 'json_object' }
    }, { headers: { 'Authorization': 'Bearer ' + key } });
    console.log(model, '-> SUCCESS:', res.data.choices[0].message.content);
    return true;
  } catch (e) {
    console.log(model, '-> FAILED:', e.response?.data?.error?.message || e.message);
    return false;
  }
}

async function run() {
  await test('llama-3.1-8b-instant');
  await test('llama3-8b-8192');
  await test('qwen/qwen3.8-27b');
  await test('openai/gpt-oss-120b');
  await test('openai/gpt-oss-20b');
}
run();
