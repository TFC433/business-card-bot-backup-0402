# main.py
import sys, subprocess, time, socket, requests
from PySide6.QtWidgets import QApplication, QWidget, QPushButton, QLabel, QVBoxLayout, QLineEdit, QTextEdit, QProgressBar
from PySide6.QtCore import Qt, QTimer
from dotenv import load_dotenv
import os

# load env
load_dotenv()
LINE_BOT_PATH = os.getenv("LINE_BOT_PATH", r"D:\business-card-bot\claude ocr\line bot")
NGROK_TOKEN = os.getenv("NGROK_TOKEN")
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")

# 檢查 port
def check_port(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    try:
        s.connect((host, port))
        s.close()
        return True
    except:
        return False

class ServiceManager(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LINE Bot + ngrok 自動化管理")
        self.setFixedSize(420, 480)

        # 自動化按鈕
        self.toggle_btn = QPushButton("啟動自動化")
        self.toggle_btn.clicked.connect(self.toggle_automation)
        self.is_running = False

        # 狀態標籤
        self.status_label = QLabel("服務狀態: 🔴 停止")

        # 進度條
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)

        # Webhook
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("https://xxx.ngrok-free.app/webhook")
        self.url_input.setReadOnly(True)

        # 日誌
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)

        # Layout
        layout = QVBoxLayout()
        layout.addWidget(self.toggle_btn)
        layout.addWidget(self.status_label)
        layout.addWidget(self.progress_bar)
        layout.addWidget(QLabel("Webhook URL:"))
        layout.addWidget(self.url_input)
        layout.addWidget(QLabel("日誌:"))
        layout.addWidget(self.log_area)
        self.setLayout(layout)

        # 進程管理
        self.line_proc = None
        self.ngrok_proc = None
        self.ngrok_url = ""

        # 狀態檢查計時器
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self.check_status)
        self.status_timer.start(5000)  # Check every 5 seconds

        # 自動化計時器
        self.automation_timer = QTimer()
        self.automation_timer.timeout.connect(self.run_automation_step)
        self.automation_step = 0
        self.attempt = 0
        self.max_attempts = 10

    # LINE Bot
    def start_line_bot(self):
        if self.line_proc is None:
            self.log("啟動 LINE Bot...")
            self.progress_bar.setValue(80)
            self.line_proc = subprocess.Popen(
                ["powershell", "-NoExit", "-Command", f"cd '{LINE_BOT_PATH}'; npm start"],
                shell=True
            )
        else:
            self.log("LINE Bot 已在運行")

    def stop_line_bot(self):
        if self.line_proc:
            self.line_proc.terminate()
            self.line_proc = None
            self.log("LINE Bot 已停止")

    # ngrok
    def start_ngrok(self):
        if self.ngrok_proc is None:
            self.log("啟動 ngrok...")
            self.progress_bar.setValue(20)
            self.ngrok_proc = subprocess.Popen(
                ["ngrok", "http", "3000", "--authtoken", NGROK_TOKEN],
                shell=True
            )
        else:
            self.log("ngrok 已在運行")

    def stop_ngrok(self):
        if self.ngrok_proc:
            self.ngrok_proc.terminate()
            self.ngrok_proc = None
            self.log("ngrok 已停止")

    # 狀態檢查
    def check_status(self):
        # LINE Bot port 3000
        line_running = check_port("127.0.0.1", 3000)
        ngrok_running = check_port("127.0.0.1", 4040)

        # Update status label
        if line_running and ngrok_running:
            self.status_label.setText("服務狀態: 🟢 運行中")
        else:
            self.status_label.setText("服務狀態: 🔴 停止")

        # ngrok URL
        if ngrok_running:
            try:
                r = requests.get("http://127.0.0.1:4040/api/tunnels")
                tunnels = r.json().get("tunnels", [])
                if tunnels:
                    url = tunnels[0]["public_url"] + "/webhook"
                    if url != self.ngrok_url:
                        self.ngrok_url = url
                        self.url_input.setText(url)
                        self.log(f"檢測到新 ngrok URL: {url}")
            except:
                pass
        else:
            self.ngrok_url = ""
            self.url_input.setText("")

    # Webhook
    def update_webhook(self):
        url = self.url_input.text().strip()
        if not url:
            self.log("Webhook URL 為空")
            self.progress_bar.setValue(0)
            return False
        headers = {
            "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        data = {"endpoint": url}
        try:
            self.log("更新 Webhook...")
            self.progress_bar.setValue(50)
            r = requests.put(
                "https://api.line.me/v2/bot/channel/webhook/endpoint",
                headers=headers,
                json=data
            )
            if r.status_code == 200:
                self.log(f"Webhook 更新成功: {url}")
                self.progress_bar.setValue(70)
                return True
            else:
                self.log(f"Webhook 更新失敗: {r.status_code} {r.text}")
                self.progress_bar.setValue(0)
                return False
        except Exception as e:
            self.log(f"Webhook 更新例外: {e}")
            self.progress_bar.setValue(0)
            return False

    # 自動化切換
    def toggle_automation(self):
        if self.is_running:
            self.log("停止自動化流程...")
            self.stop_line_bot()
            self.stop_ngrok()
            self.toggle_btn.setText("啟動自動化")
            self.progress_bar.setValue(0)
            self.is_running = False
            self.automation_timer.stop()
            self.automation_step = 0
            self.attempt = 0
        else:
            self.log("啟動自動化流程...")
            self.toggle_btn.setText("停止自動化")
            self.is_running = True
            self.automation_step = 0
            self.attempt = 0
            self.progress_bar.setValue(0)
            self.run_automation_step()  # Start immediately
            self.automation_timer.start(3000)  # Check every 3 seconds

    def run_automation_step(self):
        if self.automation_step == 0:
            # Step 1: Start ngrok
            self.start_ngrok()
            self.automation_step = 1
        elif self.automation_step == 1:
            # Step 2: Wait for ngrok URL
            if self.ngrok_url:
                self.automation_step = 2
            elif self.attempt < self.max_attempts:
                self.log(f"等待 ngrok URL (嘗試 {self.attempt + 1}/{self.max_attempts})...")
                self.attempt += 1
            else:
                self.log("錯誤: 無法獲取 ngrok URL")
                self.stop_automation()
        elif self.automation_step == 2:
            # Step 3: Update webhook
            if self.update_webhook():
                self.automation_step = 3
            else:
                self.log("錯誤: Webhook 更新失敗")
                self.stop_automation()
        elif self.automation_step == 3:
            # Step 4: Start LINE bot
            self.start_line_bot()
            self.progress_bar.setValue(100)
            self.automation_timer.stop()
            self.automation_step = 0
            self.attempt = 0

    def stop_automation(self):
        self.stop_ngrok()
        self.toggle_btn.setText("啟動自動化")
        self.is_running = False
        self.automation_timer.stop()
        self.automation_step = 0
        self.attempt = 0
        self.progress_bar.setValue(0)

    # 日誌
    def log(self, msg):
        self.log_area.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        print(msg)

    # 關閉時確實停止子程序
    def closeEvent(self, event):
        self.log("關閉程式，停止服務...")
        self.stop_line_bot()
        self.stop_ngrok()
        self.automation_timer.stop()
        self.status_timer.stop()
        event.accept()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = ServiceManager()
    window.show()
    sys.exit(app.exec())