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
    print(f"[{ts}] ▶ BT connect from {bt_addr}", flush=True)
    # Important : l'app Appetito Box garde la conn BT ouverte après envoi
    # du ticket et attend un ACK printer. Sans signal, recv() bloque
    # indéfiniment. → on met un timeout 5s : 5s sans data = ticket fini,
    # on POST, on envoie un ACK, on close.
    bt_sock.settimeout(5.0)
    buffer = b""
    MAX_BUFFER = 500_000  # 500 KB safety cap
    try:
        while True:
            try:
                data = bt_sock.recv(RECV_BUF)
            except (TimeoutError, socket.timeout):
                print(f"[{ts}] ⏱ recv timeout 5s, ticket assumed complete ({len(buffer)} bytes)", flush=True)
                break
            except OSError:
                break
            if not data:
                break
            buffer += data
            if len(buffer) > MAX_BUFFER:
                print(f"[{ts}] ⚠ buffer cap {MAX_BUFFER} reached, stopping recv", flush=True)
                break
    except Exception as e:
        print(f"[{ts}] ✕ BT recv error from {bt_addr}: {e}", flush=True)

    bytes_relayed = len(buffer)
    if buffer:
        try:
            with socket.create_connection(TCP_TARGET, timeout=10) as tcp:
                tcp.sendall(buffer)
        except Exception as e:
            print(f"[{ts}] ✕ TCP relay error: {e}", flush=True)

    # Envoie un ACK à la tablette pour qu'elle affiche "impression OK".
    # ESC/POS Real-time status response = 0x12 (printer ready, no error).
    # STAR status byte similaire. Sans ça, l'app affiche "Erreur".
    try:
        bt_sock.sendall(b'\x12')
    except Exception as e:
        print(f"[{ts}] note: could not send ACK: {e}", flush=True)

    ts_end = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts_end}] ◀ BT done from {bt_addr} ({bytes_relayed} bytes relayed)", flush=True)
    try:
        bt_sock.close()
    except Exception:
        pass


def main() -> None:
    bt = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    bt.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    bt.bind(("00:00:00:00:00:00", BT_CHANNEL))
    bt.listen(5)
    print(f"Bluetooth RFCOMM bridge listening on channel {BT_CHANNEL} → TCP {TCP_TARGET[0]}:{TCP_TARGET[1]}")
    sys.stdout.flush()
    while True:
        client, addr = bt.accept()
        threading.Thread(target=relay, args=(client, addr), daemon=True).start()


if __name__ == "__main__":
    main()
