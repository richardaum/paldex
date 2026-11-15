"""Verifica se há commits mais novos no GitHub (somente leitura: `git ls-remote`, sem baixar nada)."""
import subprocess
from pathlib import Path

REPO_DIR = Path(__file__).parent


def _git(*args: str) -> "tuple[int, str]":
    r = subprocess.run(["git", *args], cwd=REPO_DIR, capture_output=True, text=True, timeout=15)
    return r.returncode, r.stdout.strip()


def check_update(git=_git, branch: str = "master") -> dict:
    """{available, local, remote, url}. Qualquer falha (sem git, sem rede, sem remote) = sem aviso."""
    none = {"available": False}
    try:
        code, local = git("rev-parse", "HEAD")
        if code != 0 or not local:
            return none
        code, out = git("ls-remote", "origin", f"refs/heads/{branch}")
        if code != 0 or not out:
            return none
        remote = out.split()[0]
        if remote == local:
            return none
        # O commit remoto já está no histórico local (estou à frente): nada a baixar.
        if git("merge-base", "--is-ancestor", remote, "HEAD")[0] == 0:
            return none
        _, url = git("remote", "get-url", "origin")
        return {"available": True, "local": local[:7], "remote": remote[:7], "url": url}
    except Exception:
        return none
