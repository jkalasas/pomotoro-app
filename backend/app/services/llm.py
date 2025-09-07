import json

from google import generativeai as genai
from app.config import settings


async def call_gemini_for_tasks(description: str) -> dict:
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.gemini_model)
    prompt = f"""
    You are a project management assistant. Your task is to break down a user's goal into a list of smaller, actionable tasks.
    You must also suggest a standard Pomodoro timer configuration.
    The user's goal is: "{description}"

    Analyze the goal and provide a response in a strict JSON format. The JSON object must have three keys:
    1. "session": A JSON object with "name" (string), "description" (string).
    2. "tasks": A list of JSON objects, where each object has "name" (string), "category" (string), and "estimated_completion_time" (integer in minutes).
    3. "pomodoro_setup": A JSON object with "focus_duration", "short_break_duration", "long_break_duration" (all integers in minutes), and "long_break_per_pomodoros" (integer).


    The session name should be a concise title summarizing the goal.
    Do not include any text or markdown formatting outside of the main JSON object.
    It is allowed to not use the standard 5 minutes focus, 5 minutes short break, 15 minutes long break after 4 pomodoros, always analyze the tasks to give the proper pomodoro setup.
    Do not include optional tasks.
    """
    try:
        response = await model.generate_content_async(prompt)
        cleaned_response_text = (
            response.text.strip().replace("```json", "").replace("```", "").strip()
        )
        return json.loads(cleaned_response_text)
    except Exception as e:
        print(f"Error calling Gemini API or parsing JSON: {e}")
        raise
