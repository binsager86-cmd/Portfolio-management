import subprocess
import sys

# Launch Streamlit without blocking
subprocess.Popen([sys.executable, "-m", "streamlit", "run", "ui.py"])
print("Streamlit started. Access at http://localhost:8501")
