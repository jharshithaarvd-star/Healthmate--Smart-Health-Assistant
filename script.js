
document.addEventListener("DOMContentLoaded", function () {

    const symptom = document.getElementById("symptom");
    const button = document.getElementById("checkButton");
    const result = document.getElementById("result");

    if (!symptom || !button || !result) {
        alert("Error: Check the HTML IDs in index.html");
        return;
    }

    const information = {
        headache: {
            title: "Headache",
            message: "Headaches can have several causes, including stress, lack of sleep, or dehydration. Rest if appropriate. Seek medical advice if the headache persists or concerns you."
        },

        cough: {
            title: "Cough",
            message: "A cough can have many causes. Rest and drink fluids if appropriate. Seek medical advice if it persists or worsens."
        },

        fever: {
            title: "Fever",
            message: "Fever can occur with infections and other conditions. Rest and drink fluids if appropriate. Seek medical advice if the fever is high, persistent, or worsening."
        },

        stomach: {
            title: "Stomach Pain",
            message: "Stomach pain can have many causes. Severe or sudden abdominal pain needs urgent medical assessment."
        },

        fatigue: {
            title: "Tiredness",
            message: "Tiredness can be related to sleep, stress, or other health conditions. Maintain a regular sleep routine and seek medical advice if it persists."
        }
    };

    button.addEventListener("click", function () {

        const selected = symptom.value;

        if (!selected) {
            result.innerHTML = "<p>Please select a symptom first.</p>";
            result.style.display = "block";
            return;
        }

        const data = information[selected];

        if (!data) {
            result.textContent = "Sorry, no information is available for this symptom.";
            result.style.display = "block";
            return;
        }

        result.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = data.title;

        const paragraph = document.createElement("p");
        paragraph.textContent = data.message;

        const note = document.createElement("p");
        note.textContent =
            "Important: This is general health information, not a diagnosis. Consult a qualified healthcare professional for medical advice.";

        result.append(heading, paragraph, note);
        result.style.display = "block";
    });

});