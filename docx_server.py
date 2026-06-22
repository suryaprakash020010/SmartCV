from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess, json, tempfile, os, uuid

app = Flask(__name__)
CORS(app)

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    out_path = f"/tmp/smartcv_{uuid.uuid4().hex}.docx"
    payload = json.dumps({**data, "outputPath": out_path})
    result = subprocess.run(
        ["node", os.path.join(os.path.dirname(__file__), "gen_docx.cjs"), payload],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0 or not os.path.exists(out_path):
        return jsonify({"error": result.stderr or "Generation failed"}), 500
    return send_file(out_path, as_attachment=True, download_name="SmartCV_Tailored.docx",
                     mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

if __name__ == '__main__':
    app.run(port=7821, debug=False)
