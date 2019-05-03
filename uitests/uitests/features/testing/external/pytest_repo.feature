@test
@https://github.com/pytest-dev/pytest.git
Feature: Tests in PyTest Repo
    Scenario: Tests will be discovered
        Given the package "pytest" is installed
        And the package "hypothesis" is installed
        And the workspace setting "python.testing.pyTestEnabled" is enabled
        And the workspace setting "python.testing.unittestEnabled" is disabled
        And the workspace setting "python.testing.nosetestsEnabled" is disabled
        When I reload VSC
        And I select the command "Python: Discover Tests"
        Then the test explorer icon will be visible
        When I select the command "View: Show Test"
        And I wait for tests discovery to complete
        And I expand the first 10 of the test tree nodes
        Then there are at least 10 nodes in the tree

    Scenario: At least one test will run successfully
        Given the package "pytest" is installed
        And the package "hypothesis" is installed
        And the workspace setting "python.testing.pyTestEnabled" is enabled
        And the workspace setting "python.testing.unittestEnabled" is disabled
        And the workspace setting "python.testing.nosetestsEnabled" is disabled
        When I reload VSC
        And I select the command "Python: Discover Tests"
        Then the test explorer icon will be visible
        When I select the command "View: Show Test"
        And I wait for tests discovery to complete
        And I expand the first 10 of the test tree nodes
        Then there are at least 10 nodes in the tree
        # So far same as previous scenario.
        # Run the 5th node, this would be a test funtion,
        # Assuming pytest does not have more than 5 folder deep in the top.
        When I run the test node number 5
        And I wait for 5 seconds
        And I wait for tests to complete running
        Then the node number 5 has a status of "Success"


    Scenario: Can debug a test
        Given the package "pytest" is installed
        And the package "hypothesis" is installed
        And the workspace setting "python.testing.pyTestEnabled" is enabled
        And the workspace setting "python.testing.unittestEnabled" is disabled
        And the workspace setting "python.testing.nosetestsEnabled" is disabled
        When I reload VSC
        And I select the command "Python: Discover Tests"
        Then the test explorer icon will be visible
        When I select the command "View: Show Test"
        And I wait for tests discovery to complete
        And I expand the first 10 of the test tree nodes
        Then there are at least 10 nodes in the tree
        # So far same as previous scenario.
        # Run the 5th node, this would be a test funtion,
        # Assuming pytest does not have more than 5 folder deep in the top.
        When I navigate to the code associated with test node number 5
        # Wait for a file to be opened.
        And I wait for 5 seconds
        And I add a breakpoint to the current line in the current editor
        And I debug the test node number 5
        Then the debugger starts
        And the debugger pauses
        When I select the command "Debug: Continue"
        Then the debugger pauses
        When I select the command "Debug: Continue"
        Then the debugger stops

