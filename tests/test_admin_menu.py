from app.bot.handlers.admin import _admin_menu


def test_admin_menu_returns_expected_controls() -> None:
    markup = _admin_menu()
    callback_data = {
        button.callback_data
        for row in markup.inline_keyboard
        for button in row
        if button.callback_data
    }

    assert "admin:tasks" in callback_data
    assert "admin:search" in callback_data
    assert "admin:campaigns" in callback_data
    assert "admin:audit" in callback_data
    assert "admin:health" in callback_data
    assert "admin:export" in callback_data
    assert "admin:orders2:all:0" not in callback_data
    assert "admin:users2:all:0" not in callback_data
    assert "admin:stats" in callback_data
    assert "admin:finance" in callback_data
    assert "admin:users" not in callback_data
    assert "admin:orders" not in callback_data
    assert "admin:plans" in callback_data
    assert "admin:grant" in callback_data
    assert "admin:promos" in callback_data
    assert "admin:broadcast" in callback_data
