"""Classes, and the shapes where scip-python's ranges and definition roles need care."""

from typing import overload

from .core import helper, log_calls


class Base:
    retries = 3

    def __init__(self):
        self.closed = False

    def run(self):
        return self.go()

    def go(self):
        return helper(1)


class Session(Base):
    timeout = helper(5)

    class Inner:
        def deep(self):
            return helper(2)

    @log_calls
    def go(self):
        return super().go()

    @property
    def state(self):
        return helper(3)

    @state.setter
    def state(self, value):
        self.closed = helper(value)

    @staticmethod
    def build():
        return Session()

    @overload
    def fetch(self, key: int) -> int: ...

    @overload
    def fetch(self, key: str) -> str: ...

    def fetch(self, key):
        return helper(key)

    def annotated(self, other: "Base", session: Base) -> Base:
        return other


def uses_session(session: Session) -> Session:
    return session.go()
