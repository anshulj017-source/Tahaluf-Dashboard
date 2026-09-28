import os
import sys
import json
import urllib.request
import re
import subprocess
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

def get_refreshed_credentials():
    node_cmd = [
        "node",
        "-e",
        """
        const os = require('os');
        const fs = require('fs');
        const crypto = require('crypto');
        const masterKey = fs.readFileSync("/Users/anshuljaiswal/.gemini/extensions/google-workspace/.gemini-cli-workspace-master-key");
        const tokenData = fs.readFileSync("/Users/anshuljaiswal/.gemini/extensions/google-workspace/gemini-cli-workspace-token.json", 'utf8').trim();
        const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli-workspace`;
        const encryptionKey = crypto.scryptSync(masterKey, salt, 32);
        const parts = tokenData.split(":");
        const iv = Buffer.from(parts[0], 'hex');
        const tag = Buffer.from(parts[1], 'hex');
        const ciphertext = parts[2];
        const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        console.log(decrypted);
        """
    ]
    proc = subprocess.Popen(node_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to decrypt credentials: {err}")
    token_json = json.loads(out.strip())
    refresh_token = token_json["main-account"]["token"]["refreshToken"]
    url = "https://google-workspace-extension.geminicli.com/refreshToken"
    req_data = json.dumps({"refresh_token": refresh_token}).encode("utf-8")
    req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
    return Credentials(
        token=res["access_token"],
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id="338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com"
    )

def main():
    creds = get_refreshed_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    
    query = "name contains 'AFC - Gulf Cup Campaign - 29072026'"
    results = drive_service.files().list(q=query, fields="nextPageToken, files(id, name, mimeType)").execute()
    items = results.get('files', [])
    
    if not items:
        print('No files found.')
    else:
        for item in items:
            print(f"Found: {item['name']} ({item['id']}) - {item['mimeType']}")
            
            if item['mimeType'] == 'application/vnd.google-apps.spreadsheet':
                request = drive_service.files().export_media(fileId=item['id'], mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            else:
                request = drive_service.files().get_media(fileId=item['id'])
                
            from googleapiclient.http import MediaIoBaseDownload
            import io
            
            fh = io.FileIO('AFC_Gulf_Cup_Campaign.xlsx', 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                print(f"Download {int(status.progress() * 100)}%.")
            print("Download complete.")

if __name__ == '__main__':
    main()
