import pytest

from ingest.errors import IngestError
from ingest.seed import describe_target


def test_shows_host_port_and_database_without_the_password() -> None:
    url = "postgresql://postgres.ref:s3cretpw@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    target = describe_target(url)
    assert target == "aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    assert "s3cretpw" not in target


@pytest.mark.parametrize(
    "password",
    ["front@SECRETTAIL", "[front@SECRETTAIL]", "pa/SECRETTAIL"],
)
def test_an_unencoded_password_is_never_echoed(password: str) -> None:
    url = f"postgresql://postgres.ref:{password}@db.example.com:5432/postgres"
    with pytest.raises(IngestError) as caught:
        describe_target(url)
    assert "SECRETTAIL" not in str(caught.value)
    assert "percent-encoded" in str(caught.value)
