import pandas as pd
import json
from pathlib import Path
import random

DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "large_training_dataset.jsonl"

# Load your reference data
foods_df = pd.read_csv(DATA_DIR / "philfct_clean.csv")
exercises_df = pd.read_csv(DATA_DIR / "exercises.csv")

training_examples = []

# ============================================================
# 1. GENERATE NUTRITION Q&A FROM FOOD DATA
# ============================================================
for _, food in foods_df.iterrows():
    name = food.get('name', 'Unknown food')
    calories = food.get('calories', 0)
    protein = food.get('protein_g', 0)
    carbs = food.get('carbs_g', 0)
    fat = food.get('fat_g', 0)
    
    # Skip rows with missing critical data
    if pd.isna(calories) or pd.isna(protein):
        continue
    
    # Generate multiple question variations per food
    examples = [
        {
            "prompt": f"What are the nutritional values of {name}?",
            "completion": f"{name} contains approximately {calories} calories per 100g. It has {protein}g of protein, {carbs}g of carbohydrates, and {fat}g of fat."
        },
        {
            "prompt": f"How much protein is in {name}?",
            "completion": f"{name} provides {protein}g of protein per 100g serving."
        },
        {
            "prompt": f"Is {name} good for muscle building?",
            "completion": f"{name} can support muscle building as it contains {protein}g of protein and {calories} calories per 100g. {'It is high in protein.' if protein > 15 else 'Consider pairing it with other protein sources.'}"
        },
        {
            "prompt": f"Tell me about the calories in {name}",
            "completion": f"{name} has {calories} calories per 100g, with {protein}g protein, {carbs}g carbs, and {fat}g fat."
        }
    ]
    training_examples.extend(examples)

# ============================================================
# 2. GENERATE EXERCISE Q&A FROM EXERCISE DATA
# ============================================================
for _, exercise in exercises_df.iterrows():
    name = exercise.get('name', 'Unknown exercise')
    muscle = exercise.get('muscle_group', 'various muscles')
    equipment = exercise.get('equipment', 'various equipment')
    
    if pd.isna(name):
        continue
    
    examples = [
        {
            "prompt": f"How do I perform {name}?",
            "completion": f"{name} is an exercise that targets the {muscle}. It typically uses {equipment}. Focus on proper form and controlled movements."
        },
        {
            "prompt": f"What muscles does {name} work?",
            "completion": f"{name} primarily targets the {muscle} muscle group."
        },
        {
            "prompt": f"What equipment do I need for {name}?",
            "completion": f"{name} requires {equipment}."
        },
        {
            "prompt": f"Give me an exercise for {muscle}",
            "completion": f"A good exercise for {muscle} is {name}. It uses {equipment} and is effective for building strength in that area."
        }
    ]
    training_examples.extend(examples)

# ============================================================
# 3. ADD GENERAL FITNESS Q&A (hand-crafted for variety)
# ============================================================
general_qa = [
    {"prompt": "What is progressive overload?", "completion": "Progressive overload is the gradual increase of stress placed on the body during training. You can achieve this by increasing weight, reps, or sets over time to continue making gains."},
    {"prompt": "How much protein should I eat for muscle growth?", "completion": "For muscle growth, aim for 1.6 to 2.2 grams of protein per kilogram of body weight per day. Spread this across 3-4 meals for optimal muscle protein synthesis."},
    {"prompt": "What is a good pre-workout meal?", "completion": "A good pre-workout meal should contain easily digestible carbohydrates and moderate protein, eaten 1-2 hours before training. Examples include oatmeal with banana, or rice with chicken."},
    {"prompt": "How often should I work out?", "completion": "For most people, 3-5 workouts per week is optimal. This allows sufficient training stimulus while providing adequate recovery time between sessions."},
    {"prompt": "What is the best cardio for fat loss?", "completion": "The best cardio for fat loss is the one you can sustain consistently. Options include brisk walking, cycling, swimming, or HIIT. Aim for 150-300 minutes of moderate cardio per week."},
    {"prompt": "How do I lose weight safely?", "completion": "Safe weight loss involves a moderate calorie deficit of 300-500 calories per day, combined with regular exercise and adequate protein intake. Aim for 0.5-1 kg of weight loss per week."},
    {"prompt": "What are macronutrients?", "completion": "Macronutrients are the three main nutrients your body needs in large amounts: protein (for muscle repair), carbohydrates (for energy), and fats (for hormone production and nutrient absorption)."},
    {"prompt": "How much water should I drink daily?", "completion": "A general guideline is 2-3 liters of water per day, but this varies based on activity level, climate, and body size. Drink more during exercise and in hot weather."},
    {"prompt": "What is a good post-workout meal?", "completion": "A good post-workout meal should contain protein and carbohydrates within 1-2 hours after training. Examples include a protein shake with fruit, or chicken with rice and vegetables."},
    {"prompt": "How do I build muscle?", "completion": "To build muscle, you need three things: progressive resistance training, adequate protein intake (1.6-2.2g per kg body weight), and a slight calorie surplus. Consistency and recovery are also essential."},
]
training_examples.extend(general_qa)

# ============================================================
# 4. SHUFFLE AND SAVE
# ============================================================
random.shuffle(training_examples)

with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    for example in training_examples:
        f.write(json.dumps(example) + '\n')

print(f"✅ Generated {len(training_examples)} training examples")
print(f"📁 Saved to: {OUTPUT_FILE}")
print(f"📊 File size: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")