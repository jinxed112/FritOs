#!/usr/bin/env python3
"""
Pont Bluetooth → TCP pour Appetito Box.

Écoute sur RFCOMM channel 1 (canal SPP standard imprimantes thermiques).
Pour chaque connexion Bluetooth entrante, relaie le flux ESC/POS vers
TCP 127.0.0.1:9100, où capture.py prend le relais (capture + futur POST).

L'app Appetito Box "imprime" sur le Pi comme si c'était une vraie imprimante
thermique BT (UP-321B etc), mais en réalité on intercepte les tickets.

Stack : stdlib uniquement (AF_BLUETOOTH disponible dans Python 3.10+ sur Linux).
"""

import socket
import sys
import threading
from datetime import datetime

BT_CHANNEL = 1
TCP_TARGET = ("127.0.0.1", 9100)
RECV_BUF = 4096


def relay(bt_sock: socket.socket, bt_addr: tuple) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] ▶ BT connect from {bt_addr}")
    sys.stdout.flush()
    bytes_relayed = 0
    try:
        with socket.create_connection(TCP_TARGET, timeout=10) as tcp:
            while True:
                try:
                    data = bt_sock.recv(RECV_BUF)
                except OSError:
                    break
                if not data:
                    break
                tcp.sendall(data)
                bytes_relayed += len(data)
    except Exception as e:
        print(f"[{ts}] ✕ relay error from {bt_addr}: {e}")
    finally:
        ts_end = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts_end}] ◀ BT disconnect from {bt_addr} ({bytes_relayed} bytes relayed)")
        sys.stdout.flush()
        try:
            bt_sock.close()
        except Exception:
            pass


def main() -> None:
    bt = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    bt.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    bt.bind(("", BT_CHANNEL))
    bt.listen(5)
    print(f"Bluetooth RFCOMM bridge listening on channel {BT_CHANNEL} → TCP {TCP_TARGET[0]}:{TCP_TARGET[1]}")
    sys.stdout.flush()
    while True:
        client, addr = bt.accept()
        threading.Thread(target=relay, args=(client, addr), daemon=True).start()


if __name__ == "__main__":
    main()
