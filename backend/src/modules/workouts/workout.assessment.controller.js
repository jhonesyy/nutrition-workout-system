const assessmentService = require('./workout.assessment.service');

const getMyAssessment = async (req, res) => {
  try {
    const assessment = await assessmentService.getWorkoutAssessment(
      req.user.userId
    );

    res.json({
      assessment,
      completed: assessment?.assessment_status === 'completed',
      mobilityCompleted: Boolean(
        assessment?.mobility_test_completed_at
      )
    });
  } catch (error) {
    console.error('Get assessment error:', error);
    res.status(500).json({
      message: 'Unable to retrieve assessment'
    });
  }
};

const saveMyAssessment = async (req, res) => {
  try {
    const assessment = await assessmentService.saveWorkoutAssessment(
      req.user.userId,
      req.body
    );

    res.json({
      message: assessment.assessment_status === 'completed'
        ? 'Workout assessment completed successfully'
        : 'Workout assessment saved as incomplete',
      assessment,
      completed: assessment.assessment_status === 'completed',
      mobilityCompleted: Boolean(
        assessment.mobility_test_completed_at
      )
    });
  } catch (error) {
    console.error('Save assessment error:', error);
    res.status(400).json({
      message: error.message
    });
  }
};

const getMyMobilityTest = async (req, res) => {
  try {
    const assessment = await assessmentService.getWorkoutAssessment(
      req.user.userId
    );

    res.json({
      movement_screening: assessment?.movement_screening || {},
      completed: Boolean(assessment?.mobility_test_completed_at),
      completed_at: assessment?.mobility_test_completed_at || null
    });
  } catch (error) {
    console.error('Get mobility test error:', error);
    res.status(500).json({
      message: 'Unable to retrieve mobility test'
    });
  }
};

const saveMyMobilityTest = async (req, res) => {
  try {
    const assessment = await assessmentService.saveMobilityTest(
      req.user.userId,
      req.body
    );

    res.json({
      message: 'Mobility test saved successfully',
      movement_screening: assessment.movement_screening,
      completed: Boolean(assessment.mobility_test_completed_at),
      completed_at: assessment.mobility_test_completed_at
    });
  } catch (error) {
    console.error('Save mobility test error:', error);
    res.status(400).json({
      message: error.message
    });
  }
};

module.exports = {
  getMyAssessment,
  saveMyAssessment,
  getMyMobilityTest,
  saveMyMobilityTest
};
